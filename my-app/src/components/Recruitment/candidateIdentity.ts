import {getCurrentLanguage} from "@/lib/i18n";
import {enUS} from "@/lib/i18n/translations/en-US";
import {zhCN} from "@/lib/i18n/translations/zh-CN";

export type CandidateIdentityInput = {
    name?: string | null;
    name_source?: string | null;
    source_detail?: string | null;
};

export type CandidateDisplayIdentity = {
    rawName: string;
    displayName: string;
    avatarLabel: string | null;
    trusted: boolean;
    reason: "trusted" | "filename_name" | "missing" | "generated_name" | "invalid_format";
};

const trustedNameSources = new Set([
    "filename_high_confidence",
    "resume_text_explicit",
    "resume_parsed",
    "hr_manual",
]);

const blockedNameValues = new Set([
    "北京", "上海", "天津", "重庆", "深圳", "广州", "杭州", "南京", "苏州", "成都",
    "武汉", "西安", "长沙", "郑州", "济南", "青岛", "厦门", "福州", "合肥", "昆明",
    "南昌", "沈阳", "大连", "哈尔滨", "长春", "石家庄", "太原", "呼和浩特", "乌鲁木齐",
    "拉萨", "海口", "三亚", "兰州", "西宁", "银川", "贵阳", "南宁", "东莞", "佛山",
    "无锡", "温州", "简历", "候选人", "个人简历", "我的简历", "个人资料", "求职简历",
    "河北", "山西", "辽宁", "吉林", "黑龙江", "江苏", "浙江", "安徽", "福建", "江西",
    "山东", "河南", "湖北", "湖南", "广东", "海南", "四川", "贵州", "云南", "陕西",
    "甘肃", "青海", "台湾", "内蒙古", "广西", "西藏", "宁夏", "新疆", "香港", "澳门",
]);

const blockedNameParts = [
    "工程师", "设计师", "经理", "主管", "总监", "顾问", "专员", "助理", "实习", "兼职",
    "全职", "岗位", "职位", "招聘", "求职", "应聘", "城市", "全国", "远程", "测试",
    "开发", "产品", "销售", "运营", "财务", "行政", "人事", "法务", "算法", "前端", "后端",
    "简历", "资料", "附件", "程序员", "研发", "分析", "项目", "教育", "经历", "技能", "自我",
    "本科", "大专", "硕士", "博士", "专业", "联系方式", "个人介绍",
];

const blockedEnglishNameParts = [
    "engineer", "developer", "manager", "director", "designer", "consultant", "specialist",
    "assistant", "intern", "product", "software", "hardware", "frontend", "backend", "fullstack",
    "analyst", "sales", "marketing", "operation", "operations", "finance", "accountant", "resume",
    "curriculum vitae", "candidate", "recruitment", "position", "job",
];

const commonChineseSurnameCharacters = new Set(Array.from(
    "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云"
    + "苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于"
    + "时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪"
    + "舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍虞万"
    + "支柯管卢莫房解应宗宣丁邓郁单杭洪包诸左石崔吉龚程邢裴陆荣翁荀羊甄曲家封芮储靳段富"
    + "巫乌焦巴弓牧山谷车侯全班秋仲伊宫宁仇栾甘祖武符刘景詹束龙叶幸司黎乔党翟谭劳申冉牛"
    + "通边燕冀浦尚农温庄晏柴瞿阎慕连茹习艾容向古易廖耿满弘匡国文寇广聂晁敖冷辛那简饶曾"
    + "沙鞠丰巢关相查后荆红游竺权盖益桓",
));

const commonChineseCompoundSurnames = [
    "欧阳", "太史", "端木", "上官", "司马", "东方", "独孤", "南宫", "万俟", "闻人", "夏侯",
    "诸葛", "尉迟", "公羊", "赫连", "澹台", "皇甫", "宗政", "濮阳", "公冶", "太叔", "申屠",
    "公孙", "慕容", "仲孙", "钟离", "长孙", "宇文", "司徒", "鲜于", "司空", "令狐", "轩辕",
];

function fileStem(value?: string | null) {
    const fileName = String(value || "").trim().split(/[\\/]/).pop() || "";
    return fileName.replace(/\.[A-Za-z0-9]{1,10}$/, "").trim();
}

function comparableFileText(value?: string | null) {
    return fileStem(value)
        .replace(/[\s_\-—–()[\]【】{}·.]+/g, "")
        .toLocaleLowerCase();
}

function isPlausiblePersonName(value?: string | null) {
    const normalized = String(value || "").trim().replace(/\s+/g, " ");
    if (!normalized || blockedNameValues.has(normalized)) return false;
    if (blockedNameParts.some((part) => normalized.includes(part))) return false;
    const folded = normalized.toLocaleLowerCase();
    if (blockedEnglishNameParts.some((part) => folded.includes(part))) return false;
    if (/[省市县区]$/.test(normalized)) return false;
    if (/^[\p{Script=Han}]{2,4}$/u.test(normalized)) {
        return commonChineseCompoundSurnames.some((surname) => normalized.startsWith(surname))
            || commonChineseSurnameCharacters.has(Array.from(normalized)[0]);
    }
    if (/^[\p{Script=Han}]{1,4}[·•][\p{Script=Han}]{1,8}$/u.test(normalized)) return true;
    return /^[A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*){1,3}$/.test(normalized);
}

export function extractHighConfidenceNameFromResumeFilename(value?: string | null) {
    const stem = fileStem(value);
    if (!stem) return null;
    if (stem.includes("】")) {
        const suffix = stem.split("】").pop()?.trim() || "";
        if (!suffix) return null;
        const firstSegment = suffix.split(/[\s_\-—–|,，;；/]/, 1)[0].replace(/(?<=\D)\d.*$/, "").trim();
        return isPlausiblePersonName(firstSegment) ? firstSegment : null;
    }
    // Without an explicit label, English filenames are indistinguishable from job titles.
    return isPlausiblePersonName(stem) && !/[A-Za-z]/.test(stem) ? stem : null;
}

export function candidateIdentityPendingName() {
    return getCurrentLanguage() === "en-US"
        ? enUS.recruitment.candidateIdentity.namePending
        : zhCN.recruitment.candidateIdentity.namePending;
}

function avatarLabelForName(name: string) {
    const words = name.match(/[A-Za-z][A-Za-z'’-]*/g);
    if (words && words.length >= 2) {
        return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
    }
    return Array.from(name).find((character) => /[\p{L}\p{N}]/u.test(character))?.toUpperCase() || null;
}

export function resolveCandidateIdentity(
    candidate: CandidateIdentityInput,
    pendingNameLabel = candidateIdentityPendingName(),
): CandidateDisplayIdentity {
    const rawName = String(candidate.name || "").trim();
    const sourceDetail = String(candidate.source_detail || "").trim();
    const source = String(candidate.name_source || "").trim();
    const sourceName = extractHighConfidenceNameFromResumeFilename(sourceDetail || rawName);
    const generatedPrefix = /^[\s【\[（(〈《「『]|^(?:岗位|职位|应聘)\s*[:：]/.test(rawName);
    const matchesResumeFilename = Boolean(
        rawName
        && sourceDetail
        && comparableFileText(rawName) === comparableFileText(sourceDetail),
    );

    if (rawName && trustedNameSources.has(source)) {
        return {
            rawName,
            displayName: rawName,
            avatarLabel: avatarLabelForName(rawName),
            trusted: true,
            reason: "trusted",
        };
    }

    if (sourceName && (generatedPrefix || matchesResumeFilename || source === "filename_untrusted")) {
        return {
            rawName,
            displayName: sourceName,
            avatarLabel: avatarLabelForName(sourceName),
            trusted: true,
            reason: "filename_name",
        };
    }

    if (rawName && isPlausiblePersonName(rawName)) {
        return {
            rawName,
            displayName: rawName,
            avatarLabel: avatarLabelForName(rawName),
            trusted: true,
            reason: "trusted",
        };
    }

    const clearlyGenerated = generatedPrefix || matchesResumeFilename || source === "filename_untrusted";
    if (!rawName || clearlyGenerated) {
        return {
            rawName,
            displayName: pendingNameLabel,
            avatarLabel: null,
            trusted: false,
            reason: rawName ? "generated_name" : "missing",
        };
    }

    return {
        rawName,
        displayName: pendingNameLabel,
        avatarLabel: null,
        trusted: false,
        reason: "invalid_format",
    };
}
