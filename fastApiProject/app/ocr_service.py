"""
OCR Service - 个人信息OCR比对服务

将用户提供的OCR脚本封装为服务模块，保持核心逻辑不变。
改为生成器模式，支持流式输出日志。
"""
import os
import re
import json
import logging
import traceback
from typing import Iterator, Any

import cv2
import numpy as np
import pandas as pd
from paddleocr import PaddleOCR

# ===================== 环境变量：强制 CPU + MKLDNN =====================
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

# 完全屏蔽各种 GPU 设备，让 Paddle / Paddlex 不再尝试 GPU
os.environ["CUDA_VISIBLE_DEVICES"] = ""
os.environ["GPU_VISIBLE_DEVICES"] = ""
os.environ["XPU_VISIBLE_DEVICES"] = ""
os.environ["NPU_VISIBLE_DEVICES"] = ""
# Paddlex 显式指定设备为 CPU
os.environ["PADDLEX_DEVICE"] = "cpu"

# 开启 MKLDNN（oneDNN）加速
os.environ["FLAGS_use_mkldnn"] = "1"
os.environ["FLAGS_enable_mkldnn"] = "1"
# 线程数你也可以按需调大/调小
os.environ.setdefault("OMP_NUM_THREADS", "4")

# 关闭 PaddleOCR 自己的日志
logging.getLogger("ppocr").setLevel(logging.ERROR)

# ===================== 配置常量 =====================
MAX_SIDE = 960              # 图片最长边统一压到 960 像素
FOLDER_KEY_COLUMN = "姓名"   # 每个人附件文件夹名，对应 Excel 的哪一列
ENABLE_ID_CROP = False      # 是否对身份证裁剪左上区域
DEBUG = True                # 是否输出详细 OCR 分段日志


# ===================== 工具函数 =====================
def cv2_imread_chinese(path: str):
    """支持中文路径读图"""
    try:
        return cv2.imdecode(np.fromfile(path, dtype=np.uint8), -1)
    except Exception:
        return None


def resize_for_ocr(img, max_side=MAX_SIDE):
    """按最长边等比缩放到 max_side 以内"""
    h, w = img.shape[:2]
    long_side = max(h, w)
    if long_side <= max_side:
        return img
    scale = max_side / long_side
    new_w = int(w * scale)
    new_h = int(h * scale)
    return cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)


def crop_for_idcard(img):
    """
    身份证裁剪：只保留左上区域（姓名、身份证号区域）
    仅在我们明确认为是身份证时使用
    """
    h, w = img.shape[:2]
    if h == 0 or w == 0:
        return img

    if not ENABLE_ID_CROP:
        # 不裁剪，直接用整图
        return img

    # 身份证一般 1.3~2.2，宽大于高
    aspect = w / h
    if 1.3 <= aspect <= 2.2:
        y0, y1 = 0, int(0.5 * h)
        x0, x1 = 0, int(0.7 * w)
        return img[y0:y1, x0:x1]
    else:
        return img


def parse_ocr_result(result):
    """
    通用解析：兼容 predict() 的 OCRResult / dict，
    也兼容 ocr() 的 [[box, (text, score)], ...]
    返回：full_text（拼接字符串）, fragments（每段文本列表）
    """
    full_text = ""
    fragments = []

    if result is None:
        return full_text, fragments

    res_list = result if isinstance(result, list) else [result]

    for item in res_list:
        if item is None:
            continue

        # A: OCRResult 对象
        if hasattr(item, "res") and isinstance(item.res, dict):
            res = item.res
            rec_texts = res.get("rec_texts", []) or []
            for t in rec_texts:
                s = str(t)
                fragments.append(s)
                full_text += s + " "
            continue

        # B: dict
        if isinstance(item, dict):
            res = item.get("res", item)
            if isinstance(res, dict):
                rec_texts = res.get("rec_texts", []) or []
                for t in rec_texts:
                    s = str(t)
                    fragments.append(s)
                    full_text += s + " "
                continue

        # C: 旧 list 结构
        if isinstance(item, list):
            for line in item:
                if isinstance(line, (list, tuple)):
                    txt = None
                    if len(line) >= 2:
                        val = line[1]
                        if isinstance(val, (list, tuple)) and len(val) > 0:
                            txt = val[0]
                        elif isinstance(val, str):
                            txt = val
                    if txt is None and isinstance(line[0], str):
                        txt = line[0]
                    if txt is not None:
                        s = str(txt)
                        fragments.append(s)
                        full_text += s + " "
            continue

        # D: 单字符串
        if isinstance(item, str):
            fragments.append(item)
            full_text += item + " "

    return full_text.strip(), fragments


def correct_text(text: str) -> str:
    """简单错字纠正：针对身份证上常见'王'等误识别"""
    if not text:
        return text
    text = text.replace("壬", "王")
    text = text.replace("主", "王")
    text = text.replace("玉", "王")
    text = text.replace("坐", "生")
    return text


def extract_id_number(text: str):
    """从 OCR 全文中提取 18 位身份证号"""
    if not text:
        return None
    m = re.search(r"\d{17}[\dXx]", text)
    return m.group(0) if m else None


def extract_name_from_text(text: str):
    """
    从 OCR 全文中提取身份证上的姓名：
    规则：匹配 '姓名XXX'，XXX 为 2~4 个汉字（含 ·）
    """
    if not text:
        return None
    text = correct_text(text)
    m = re.search(r"姓名[:： ]*([\u4e00-\u9fa5·]{2,4})", text)
    if m:
        return m.group(1)
    return None


def normalize_name(name: str):
    if not name:
        return ""
    return str(name).strip().replace(" ", "")


def normalize_id(id_number: str):
    if not id_number:
        return ""
    return str(id_number).strip().upper()


def compare_result(excel_name, excel_id, ocr_name, ocr_id):
    """
    生成 OCR_比对结果 文本：
    - 全部匹配 / 证件号不匹配 / 姓名不匹配 / 都不匹配 / 未识别
    """
    if not ocr_name and not ocr_id:
        return "未识别"

    en = normalize_name(excel_name)
    eo = normalize_name(ocr_name)
    ei = normalize_id(excel_id)
    oi = normalize_id(ocr_id)

    name_match = (en != "" and eo != "" and en == eo)
    id_match = (ei != "" and oi != "" and ei == oi)

    if name_match and id_match:
        return "全部匹配"
    elif name_match and not id_match:
        return "证件号不匹配"
    elif (not name_match) and id_match:
        return "姓名不匹配"
    elif (not name_match) and (not id_match):
        return "都不匹配"
    else:
        return "未识别"


def is_id_priority_file(file_name: str) -> bool:
    """判断是否优先当做身份证图片处理（基于文件名）"""
    lower = file_name.lower()
    if "身份证" in file_name:
        return True
    if "证件" in file_name:
        return True
    if "idcard" in lower:
        return True
    if "id_" in lower:
        return True
    return False


def is_ratio_id_candidate(img) -> bool:
    """根据宽高比判断是否疑似身份证：1.5 ~ 1.7"""
    h, w = img.shape[:2]
    if h == 0 or w == 0:
        return False
    aspect = w / h
    return 1.5 <= aspect <= 1.7


def emit_log(msg: str):
    """构造日志消息（流式返回到前端）"""
    return json.dumps({"type": "log", "content": msg}, ensure_ascii=False) + "\n"


# ===================== 单张图片 OCR（生成器） =====================
def ocr_id_from_image(ocr: PaddleOCR, img_path: str, crop_mode: str = "id") -> Iterator[Any]:
    """
    对单张图片做 OCR，尝试抽取姓名 & 身份证号。
    Yields: log strings
    Returns: (ocr_name, ocr_id, full_text) via StopIteration value
    """
    file = os.path.basename(img_path)
    img = cv2_imread_chinese(img_path)
    if img is None:
        yield emit_log(f"    ❌ 无法读取图片：{file}")
        return None, None, ""

    img = resize_for_ocr(img)
    if crop_mode == "id":
        img = crop_for_idcard(img)

    # OCR：先 predict，失败再用 ocr()
    try:
        result = ocr.predict(img)
    except Exception:
        try:
            result = ocr.ocr(img)
        except Exception as e:
            yield emit_log(f"    ❌ OCR 调用出错：{e}")
            return None, None, ""

    full_text, fragments = parse_ocr_result(result)
    full_text = correct_text(full_text)

    # 日志：全文 + 分段
    if full_text:
        preview = full_text if len(full_text) <= 150 else (full_text[:150] + " ...")
        yield emit_log(f"    [OCR识别全文] {preview}")
    else:
        yield emit_log("    [OCR识别全文] （空，未识别到文字）")

    if DEBUG and fragments:
        yield emit_log(f"    [OCR分段结果] 共 {len(fragments)} 段：")
        for i, frag in enumerate(fragments, 1):
            frag_preview = frag if len(frag) <= 80 else (frag[:80] + " ...")
            yield emit_log(f"       [{i}] {frag_preview}")

    ocr_id = extract_id_number(full_text)
    ocr_name = extract_name_from_text(full_text)

    yield emit_log(f"    [提取结果] 姓名={ocr_name or 'None'}，身份证号={ocr_id or 'None'}")
    return ocr_name, ocr_id, full_text


def find_matching_row_index(df, ocr_name, ocr_id, id_col, matched_indices):
    """
    附件优先模式下：根据 OCR 的姓名+身份证号，去 Excel 里找对应的行。
    """
    ocr_name_norm = normalize_name(ocr_name)
    ocr_id_norm = normalize_id(ocr_id)

    # 1. 优先身份证号匹配
    if id_col is not None and ocr_id_norm:
        for idx, row in df.iterrows():
            if idx in matched_indices:
                continue
            excel_id = row[id_col]
            if pd.isna(excel_id):
                continue
            if normalize_id(excel_id) == ocr_id_norm:
                return idx

    # 2. 其次姓名匹配
    if ocr_name_norm:
        for idx, row in df.iterrows():
            if idx in matched_indices:
                continue
            excel_name = normalize_name(row["姓名"])
            if excel_name and excel_name == ocr_name_norm:
                return idx

    return None


# ===================== 全局 OCR 单例 =====================
_GLOBAL_OCR: PaddleOCR | None = None


def get_ocr_engine() -> PaddleOCR:
    """
    获取或初始化全局 OCR 引擎。
    整个 FastAPI 进程里只初始化一次，后续所有请求复用。
    """
    global _GLOBAL_OCR
    if _GLOBAL_OCR is None:
        # 和你本地脚本完全一致的初始化参数
        _GLOBAL_OCR = PaddleOCR(
            lang="ch",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )
    return _GLOBAL_OCR


# ===================== 模式1：Excel → 附件 =====================
def _run_excel_first(excel_path: str, source_folder: str, target_excel_path: str) -> Iterator[str]:
    """模式1：按 Excel → 附件"""
    yield emit_log("=" * 60)
    yield emit_log("【模式1】按 Excel 顺序匹配附件 开始...")

    # 1. 读取 Excel
    try:
        df = pd.read_excel(excel_path)
    except Exception as e:
        yield emit_log(f"❌ 读取 Excel 失败: {e}")
        return False

    if "姓名" not in df.columns:
        yield emit_log("❌ Excel 中未找到『姓名』列，请检查表头。")
        return False
    if FOLDER_KEY_COLUMN not in df.columns:
        yield emit_log(f"❌ Excel 中未找到文件夹关联列：{FOLDER_KEY_COLUMN}")
        return False

    # 自动检测身份证号列
    id_col = None
    for col in df.columns:
        col_str = str(col)
        if ("身份证" in col_str) or ("证件号" in col_str) or ("证件号码" in col_str):
            id_col = col
            break
    if id_col is None:
        yield emit_log("⚠️ 未检测到身份证号列（列名包含 '身份证' 或 '证件号'），比对时身份证部分会是空。")

    # 新增输出列
    for col in ["OCR_姓名", "OCR_身份证号", "OCR_比对结果"]:
        if col not in df.columns:
            df[col] = ""

    # 2. 获取全局 OCR 引擎
    yield emit_log("正在获取 PaddleOCR 引擎 (CPU + oneDNN)...")
    try:
        ocr = get_ocr_engine()
        yield emit_log("PaddleOCR 引擎就绪！\n")
    except Exception as e:
        yield emit_log(f"❌ 初始化 OCR 引擎失败: {e}")
        return False

    # 3. 按行（每个人）处理
    total_rows = len(df)
    for idx, row in df.iterrows():
        person_index = idx + 1
        name_excel = str(row["姓名"]).strip()
        folder_key = str(row[FOLDER_KEY_COLUMN]).strip()

        yield emit_log("-" * 60)
        yield emit_log(f"[{person_index}/{total_rows}] 处理人员：{name_excel} (文件夹 key={folder_key})")

        if not folder_key:
            yield emit_log("  ⚠️ 此行没有文件夹 key，标记为未识别")
            df.at[idx, "OCR_比对结果"] = "未识别"
            continue

        person_folder = os.path.join(source_folder, folder_key)
        if not os.path.isdir(person_folder):
            yield emit_log(f"  ⚠️ 未找到附件文件夹：{person_folder}，标记为未识别")
            df.at[idx, "OCR_比对结果"] = "未识别"
            continue

        # 列出当前人的所有图片
        files = [
            f for f in os.listdir(person_folder)
            if f.lower().endswith((".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"))
        ]
        if not files:
            yield emit_log("  ⚠️ 附件文件夹中没有图片，标记为未识别")
            df.at[idx, "OCR_比对结果"] = "未识别"
            continue

        found = False
        stop_due_to_grad = False
        excel_id = (
            str(row[id_col]).strip()
            if id_col is not None and not pd.isna(row[id_col])
            else ""
        )

        # ---------- 阶段 1：文件名优先（身份证/证件） ----------
        priority_files = [f for f in files if is_id_priority_file(f)]
        other_files = [f for f in files if f not in priority_files]

        if priority_files:
            yield emit_log(f"  [阶段1] 文件名包含身份证/证件的优先图片: {priority_files}")
        for f in priority_files:
            img_path = os.path.join(person_folder, f)
            yield emit_log(f"  -> 阶段1识别：{f}")

            gen = ocr_id_from_image(ocr, img_path, crop_mode="id")
            ocr_name, ocr_id, full_text = yield from gen

            if ocr_name and ocr_id:
                df.at[idx, "OCR_姓名"] = ocr_name
                df.at[idx, "OCR_身份证号"] = ocr_id
                result_str = compare_result(name_excel, excel_id, ocr_name, ocr_id)
                df.at[idx, "OCR_比对结果"] = result_str

                yield emit_log(f"  ✔ 阶段1成功：姓名={ocr_name}，身份证号={ocr_id}")
                yield emit_log(f"  ✔ 与 Excel 比对结果：{result_str}")
                yield emit_log("  ✔ 停止该人员后续附件识别，继续下一个人。\n")
                found = True
                break

            yield emit_log("    ✖ 阶段1未提取到完整姓名 + 身份证号，尝试后续阶段...\n")

        if found:
            continue

        # ---------- 阶段 2：按尺寸筛选疑似身份证（1.5~1.7） ----------
        ratio_candidates = []
        for f in other_files:
            img_path = os.path.join(person_folder, f)
            img = cv2_imread_chinese(img_path)
            if img is None:
                continue
            if is_ratio_id_candidate(img):
                ratio_candidates.append(f)

        if ratio_candidates:
            yield emit_log(f"  [阶段2] 尺寸疑似身份证的图片: {ratio_candidates}")

        processed_files = set(priority_files)

        for f in ratio_candidates:
            img_path = os.path.join(person_folder, f)
            yield emit_log(f"  -> 阶段2识别：{f}")

            gen = ocr_id_from_image(ocr, img_path, crop_mode="id")
            ocr_name, ocr_id, full_text = yield from gen

            processed_files.add(f)

            if ocr_name and ocr_id:
                df.at[idx, "OCR_姓名"] = ocr_name
                df.at[idx, "OCR_身份证号"] = ocr_id
                result_str = compare_result(name_excel, excel_id, ocr_name, ocr_id)
                df.at[idx, "OCR_比对结果"] = result_str

                yield emit_log(f"  ✔ 阶段2成功：姓名={ocr_name}，身份证号={ocr_id}")
                yield emit_log(f"  ✔ 与 Excel 比对结果：{result_str}")
                yield emit_log("  ✔ 停止该人员后续附件识别，继续下一个人。\n")
                found = True
                break

            yield emit_log("    ✖ 阶段2未提取到完整姓名 + 身份证号，继续...\n")

        if found:
            continue

        # ---------- 阶段 3：全量顺序识别剩余图片 ----------
        rest_files = [f for f in files if f not in processed_files]
        if rest_files:
            yield emit_log(f"  [阶段3] 全量兜底识别剩余图片: {rest_files}")

        for f in rest_files:
            img_path = os.path.join(person_folder, f)
            yield emit_log(f"  -> 阶段3识别：{f}")

            gen = ocr_id_from_image(ocr, img_path, crop_mode="none")
            ocr_name, ocr_id, full_text = yield from gen

            # 如果识别到“毕业”，直接中断该人员识别
            if "毕业" in (full_text or ""):
                yield emit_log("    ⚠️ 检测到 '毕业' 关键字，判定为毕业证相关，终止该人员后续识别。")
                stop_due_to_grad = True
                break

            if ocr_name and ocr_id:
                df.at[idx, "OCR_姓名"] = ocr_name
                df.at[idx, "OCR_身份证号"] = ocr_id
                result_str = compare_result(name_excel, excel_id, ocr_name, ocr_id)
                df.at[idx, "OCR_比对结果"] = result_str

                yield emit_log(f"  ✔ 阶段3成功：姓名={ocr_name}，身份证号={ocr_id}")
                yield emit_log(f"  ✔ 与 Excel 比对结果：{result_str}")
                yield emit_log("  ✔ 停止该人员后续附件识别，继续下一个人。\n")
                found = True
                break

            yield emit_log("    ✖ 阶段3未提取到完整姓名 + 身份证号，继续...\n")

        if not found:
            if stop_due_to_grad:
                yield emit_log("  ✖ 遇到毕业证相关图片，已提前终止识别，本人结果标记为 未识别")
            else:
                yield emit_log("  ✖ 已遍历该人员所有附件，未识别到完整身份证信息，标记为 未识别")
            df.at[idx, "OCR_比对结果"] = "未识别"

    # 4. 保存结果
    try:
        df.to_excel(target_excel_path, index=False)
        yield emit_log("=" * 60)
        yield emit_log(f"✅ 所有人员处理完成，结果已保存到：{target_excel_path}")
        yield emit_log("   新增列：OCR_姓名 / OCR_身份证号 / OCR_比对结果")
        return True
    except Exception as e:
        yield emit_log(f"❌ 保存结果失败: {e}")
        return False


# ===================== 模式2：附件 → Excel =====================
def _run_attachment_first(excel_path: str, source_folder: str, target_excel_path: str) -> Iterator[str]:
    """模式2：按 附件 → Excel 匹配"""
    yield emit_log("=" * 60)
    yield emit_log("【模式2】按 附件 → 反查匹配 Excel 开始...")

    # 1. 读取 Excel
    try:
        df = pd.read_excel(excel_path)
    except Exception as e:
        yield emit_log(f"❌ 读取 Excel 失败: {e}")
        return False

    if "姓名" not in df.columns:
        yield emit_log("❌ Excel 中未找到『姓名』列，请检查表头。")
        return False

    # 自动检测身份证号列
    id_col = None
    for col in df.columns:
        col_str = str(col)
        if ("身份证" in col_str) or ("证件号" in col_str) or ("证件号码" in col_str):
            id_col = col
            break
    if id_col is None:
        yield emit_log("⚠️ 未检测到身份证号列（列名包含 '身份证' 或 '证件号'），比对时身份证部分会是空。")

    # 新增输出列
    for col in ["OCR_姓名", "OCR_身份证号", "OCR_比对结果"]:
        if col not in df.columns:
            df[col] = ""

    df["OCR_比对结果"] = df["OCR_比对结果"].replace("", "未识别")

    # 2. 获取全局 OCR 引擎
    yield emit_log("正在获取 PaddleOCR 引擎 (CPU + oneDNN)...")
    try:
        ocr = get_ocr_engine()
        yield emit_log("PaddleOCR 引擎就绪！\n")
    except Exception as e:
        yield emit_log(f"❌ 初始化 OCR 引擎失败: {e}")
        return False

    matched_indices = set()

    # 3. 遍历附件根目录下的每一个子文件夹
    if not os.path.isdir(source_folder):
        yield emit_log(f"❌ 附件根目录不存在：{source_folder}")
        return False

    subfolders = [
        d for d in os.listdir(source_folder)
        if os.path.isdir(os.path.join(source_folder, d))
    ]
    yield emit_log(f"在附件根目录下发现 {len(subfolders)} 个子文件夹：{subfolders}")

    for folder_name in subfolders:
        folder_path = os.path.join(source_folder, folder_name)
        yield emit_log("-" * 60)
        yield emit_log(f"处理附件文件夹：{folder_name}")

        files = [
            f for f in os.listdir(folder_path)
            if f.lower().endswith((".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"))
        ]
        if not files:
            yield emit_log("  ⚠️ 该文件夹内没有图片，跳过")
            continue

        found_for_folder = False
        stop_due_to_grad = False

        # ===== 阶段 1：文件名优先（身份证/证件） =====
        priority_files = [f for f in files if is_id_priority_file(f)]
        other_files = [f for f in files if f not in priority_files]

        if priority_files:
            yield emit_log(f"  [阶段1] 文件名包含身份证/证件的优先图片: {priority_files}")

        processed_files = set()

        for f in priority_files:
            img_path = os.path.join(folder_path, f)
            yield emit_log(f"  -> 阶段1识别：{f}")

            gen = ocr_id_from_image(ocr, img_path, crop_mode="id")
            ocr_name, ocr_id, full_text = yield from gen

            processed_files.add(f)

            if "毕业" in (full_text or ""):
                yield emit_log("    ⚠️ 检测到 '毕业' 关键字，判定为毕业证相关，跳过该图片。")
                continue

            if not (ocr_name and ocr_id):
                yield emit_log("    ✖ 阶段1未提取到完整姓名 + 身份证号，继续下一张...")
                continue

            match_idx = find_matching_row_index(df, ocr_name, ocr_id, id_col, matched_indices)
            if match_idx is None:
                yield emit_log("    ✖ 在 Excel 中未找到匹配行（根据身份证号 / 姓名），继续下一张...")
                continue

            excel_name = df.at[match_idx, "姓名"]
            excel_id = (
                str(df.at[match_idx, id_col]).strip()
                if id_col is not None and not pd.isna(df.at[match_idx, id_col])
                else ""
            )
            result_str = compare_result(excel_name, excel_id, ocr_name, ocr_id)

            df.at[match_idx, "OCR_姓名"] = ocr_name
            df.at[match_idx, "OCR_身份证号"] = ocr_id
            df.at[match_idx, "OCR_比对结果"] = result_str
            matched_indices.add(match_idx)
            found_for_folder = True

            yield emit_log(f"  ✔ 阶段1成功匹配 Excel 行 {match_idx + 1}：姓名={ocr_name}，身份证号={ocr_id}")
            yield emit_log(f"  ✔ 与 Excel 比对结果：{result_str}")
            yield emit_log("  ✔ 停止该文件夹后续附件识别，继续下一个文件夹。\n")
            break

        if found_for_folder:
            continue

        # ===== 阶段 2：宽高比 1.5~1.7 的"疑似身份证" =====
        ratio_candidates = []
        for f in other_files:
            img_path = os.path.join(folder_path, f)
            img = cv2_imread_chinese(img_path)
            if img is None:
                continue
            if is_ratio_id_candidate(img):
                ratio_candidates.append(f)

        if ratio_candidates:
            yield emit_log(f"  [阶段2] 尺寸疑似身份证的图片: {ratio_candidates}")

        for f in ratio_candidates:
            img_path = os.path.join(folder_path, f)
            yield emit_log(f"  -> 阶段2识别：{f}")

            gen = ocr_id_from_image(ocr, img_path, crop_mode="id")
            ocr_name, ocr_id, full_text = yield from gen

            processed_files.add(f)

            if "毕业" in (full_text or ""):
                yield emit_log("    ⚠️ 检测到 '毕业' 关键字，判定为毕业证相关，跳过该图片。")
                continue

            if not (ocr_name and ocr_id):
                yield emit_log("    ✖ 阶段2未提取到完整姓名 + 身份证号，继续下一张...")
                continue

            match_idx = find_matching_row_index(df, ocr_name, ocr_id, id_col, matched_indices)
            if match_idx is None:
                yield emit_log("    ✖ 在 Excel 中未找到匹配行（根据身份证号 / 姓名），继续下一张...")
                continue

            excel_name = df.at[match_idx, "姓名"]
            excel_id = (
                str(df.at[match_idx, id_col]).strip()
                if id_col is not None and not pd.isna(df.at[match_idx, id_col])
                else ""
            )
            result_str = compare_result(excel_name, excel_id, ocr_name, ocr_id)

            df.at[match_idx, "OCR_姓名"] = ocr_name
            df.at[match_idx, "OCR_身份证号"] = ocr_id
            df.at[match_idx, "OCR_比对结果"] = result_str
            matched_indices.add(match_idx)
            found_for_folder = True

            yield emit_log(f"  ✔ 阶段2成功匹配 Excel 行 {match_idx + 1}：姓名={ocr_name}，身份证号={ocr_id}")
            yield emit_log(f"  ✔ 与 Excel 比对结果：{result_str}")
            yield emit_log("  ✔ 停止该文件夹后续附件识别，继续下一个文件夹。\n")
            break

        if found_for_folder:
            continue

        # ===== 阶段 3：全量兜底识别剩余图片 =====
        rest_files = [f for f in files if f not in processed_files]
        if rest_files:
            yield emit_log(f"  [阶段3] 全量兜底识别剩余图片: {rest_files}")

        for f in rest_files:
            img_path = os.path.join(folder_path, f)
            yield emit_log(f"  -> 阶段3识别：{f}")

            gen = ocr_id_from_image(ocr, img_path, crop_mode="none")
            ocr_name, ocr_id, full_text = yield from gen

            if "毕业" in (full_text or ""):
                yield emit_log("    ⚠️ 检测到 '毕业' 关键字，判定为毕业证相关，终止该文件夹后续识别。")
                stop_due_to_grad = True
                break

            if not (ocr_name and ocr_id):
                yield emit_log("    ✖ 阶段3未提取到完整姓名 + 身份证号，继续下一张...")
                continue

            match_idx = find_matching_row_index(df, ocr_name, ocr_id, id_col, matched_indices)
            if match_idx is None:
                yield emit_log("    ✖ 在 Excel 中未找到匹配行（根据身份证号 / 姓名），继续下一张...")
                continue

            excel_name = df.at[match_idx, "姓名"]
            excel_id = (
                str(df.at[match_idx, id_col]).strip()
                if id_col is not None and not pd.isna(df.at[match_idx, id_col])
                else ""
            )
            result_str = compare_result(excel_name, excel_id, ocr_name, ocr_id)

            df.at[match_idx, "OCR_姓名"] = ocr_name
            df.at[match_idx, "OCR_身份证号"] = ocr_id
            df.at[match_idx, "OCR_比对结果"] = result_str
            matched_indices.add(match_idx)
            found_for_folder = True

            yield emit_log(f"  ✔ 阶段3成功匹配 Excel 行 {match_idx + 1}：姓名={ocr_name}，身份证号={ocr_id}")
            yield emit_log(f"  ✔ 与 Excel 比对结果：{result_str}")
            yield emit_log("  ✔ 停止该文件夹后续附件识别，继续下一个文件夹。\n")
            break

        if not found_for_folder:
            if stop_due_to_grad:
                yield emit_log("  ✖ 遇到毕业证相关图片，已提前终止该文件夹识别（未成功匹配到任何 Excel 行）。")
            else:
                yield emit_log("  ✖ 该文件夹所有图片均未成功匹配到 Excel 中的人员记录。")

    # 4. 再兜一遍：仍为空的 OCR_比对结果统一置为"未识别"
    df["OCR_比对结果"] = df["OCR_比对结果"].replace("", "未识别")

    # 5. 保存结果
    try:
        df.to_excel(target_excel_path, index=False)
        yield emit_log("=" * 60)
        yield emit_log(f"✅ 附件优先模式处理完成，结果已保存到：{target_excel_path}")
        yield emit_log("   新增列：OCR_姓名 / OCR_身份证号 / OCR_比对结果")
        return True
    except Exception as e:
        yield emit_log(f"❌ 保存结果失败: {e}")
        return False


# ===================== 对外主入口（给 FastAPI 调用） =====================
def run_ocr_process(
        excel_path: str,
        source_folder: str,
        target_excel_path: str,
        mode: int = 1
) -> Iterator[str]:
    """
    OCR处理主入口函数 - 生成器模式
    Yields: JSON string {"type": "log", "content": "..."} or {"type": "result", ...}
    mode:
        1 -> 按 Excel 顺序匹配附件
        2 -> 按 附件 → 反查匹配 Excel
    """
    try:
        if mode == 2:
            gen = _run_attachment_first(excel_path, source_folder, target_excel_path)
        else:
            gen = _run_excel_first(excel_path, source_folder, target_excel_path)

        success = yield from gen

        if success:
            yield json.dumps(
                {"type": "result", "success": True, "message": "OCR处理完成"},
                ensure_ascii=False
            ) + "\n"
        else:
            yield json.dumps(
                {"type": "result", "success": False, "message": "OCR处理失败，请查看日志"},
                ensure_ascii=False
            ) + "\n"

    except Exception as e:
        yield emit_log(f"❌ 处理过程出错: {e}")
        traceback.print_exc()
        yield json.dumps(
            {"type": "result", "success": False, "message": f"处理出错: {str(e)}"},
            ensure_ascii=False
        ) + "\n"
