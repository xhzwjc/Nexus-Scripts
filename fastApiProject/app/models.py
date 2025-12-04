from datetime import datetime

from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any, Literal, Union


class EnterpriseTaskBase(BaseModel):
    """企业任务基础模型"""
    name: str = Field(..., description="企业名称")
    token: str = Field(..., description="企业认证token")
    tenant_id: str = Field(..., description="租户ID")
    tax_id: str = Field(..., description="税务ID")
    items1: List[str] = Field(default_factory=list, description="需要发起结算的批次列表")
    items2: List[str] = Field(default_factory=list, description="需要重新发起结算的批次列表")
    items3: Dict[str, List[str]] = Field(default_factory=dict,
                                         description="批次下的结算单列表，键为批次号，值为结算单号列表")


class SettlementRequest(BaseModel):
    """结算处理请求模型"""
    enterprises: List[EnterpriseTaskBase] = Field(..., description="企业任务列表")
    mode: Optional[int] = Field(None,
                                description="处理模式: None-全部执行, 1-发起结算, 2-重新发起结算, 3-批次下结算单单独发起")
    concurrent_workers: int = Field(10, ge=1, le=50, description="并发工作线程数，1-50之间")
    interval_seconds: float = Field(0.0, ge=0, description="任务间隔时间(秒)，0表示并发执行")
    environment: Optional[str] = Field(None, description="运行环境: test-测试, prod-生产, local-本地")


class SettlementResponse(BaseModel):
    """结算处理响应模型"""
    success: bool = Field(..., description="是否处理成功")
    message: str = Field(..., description="处理信息")
    data: Optional[List[Any]] = Field(None, description="处理结果数据（企业列表）")
    request_id: str = Field(..., description="请求ID，用于追踪")


# 账户核对相关模型（新增）
class BalanceVerificationRequest(BaseModel):
    tenant_id: int = Field(..., ge=1, description="企业租户ID")
    environment: Optional[Literal["test", "prod", "local"]] = Field(None, description="环境")
    timeout: int = Field(15, ge=5, le=60, description="超时时间(秒)")


class BalanceVerificationResultItem(BaseModel):
    tax_location_id: int = Field(..., description="税地ID")
    tax_address: str = Field(..., description="税地地址")
    enterprise_name: str = Field(..., description="企业名称")
    is_correct: bool = Field(..., description="余额是否正确")
    total_deductions: float = Field(..., description="总扣款金额")
    total_recharges: float = Field(..., description="总充值金额")
    expected_balance: float = Field(..., description="应有余额")
    actual_balance: float = Field(..., description="实际余额")
    balance_diff: float = Field(..., description="差额(实际-应有)")


class BalanceVerificationResponse(BaseModel):
    success: bool = Field(..., description="是否成功")
    message: str = Field(..., description="处理信息")
    data: Optional[List[BalanceVerificationResultItem]] = Field(None, description="核对结果")
    request_id: str = Field(..., description="请求ID")
    enterprise_id: int = Field(..., description="企业ID")


class CommissionCalculationRequest(BaseModel):
    """佣金计算请求模型"""
    channel_id: int = Field(..., ge=1, description="渠道ID")
    environment: Optional[Literal["test", "prod", "local"]] = Field(None, description="环境")
    timeout: int = Field(15, ge=5, le=60, description="超时时间(秒)")


class CommissionDetailItem(BaseModel):
    """佣金计算详情项"""
    id: int = Field(..., description="记录ID")
    tax_id: int = Field(..., description="税地ID")
    tax_name: str = Field(..., description="税地名称")
    actual_amount: float = Field(..., description="实际支付金额")
    pay_amount: float = Field(..., description="发放金额")
    server_amount: float = Field(..., description="企业服务费")
    commission: float = Field(..., description="渠道服务费")
    channel_profit: float = Field(..., description="渠道利润")
    batch_no: str = Field(..., description="批次号")
    balance_no: str = Field(..., description="结算单号")
    rate_config: str = Field(..., description="费率配置")
    rate_detail: str = Field(..., description="详细费率")
    year_month: str = Field(..., description="所属月份")
    history_amount: float = Field(..., description="本月累计")


class EnterpriseSummaryItem(BaseModel):
    """企业汇总信息"""
    enterprise_id: int = Field(..., description="企业ID")
    enterprise_name: str = Field(..., description="企业名称")
    total_pay_amount: float = Field(..., description="累计发放金额")
    total_profit: float = Field(..., description="累计佣金收益")
    total_count: int = Field(..., description="累计交易笔数")


class CommissionCalculationResponse(BaseModel):
    """佣金计算响应模型"""
    success: bool = Field(..., description="是否成功")
    message: str = Field(..., description="处理信息")
    data: Dict[str, Any] = Field(..., description="计算结果")
    request_id: str = Field(..., description="请求ID")
    channel_id: int = Field(..., description="渠道ID")


# 在文件末尾添加
class MobileTaskInfo(BaseModel):
    """手机号任务信息模型"""
    task_id: str = Field(..., description="任务ID")
    task_content: str = Field(
        "交付成果：列明本阶段完成的具体交付物（如代码模块、设计文档、测试报告等），需标注版本号及对应功能清单。\n验收指标：对照合同要求的KPI（如性能参数、安全标准、测试覆盖率等），逐项说明达标情况，附检测数据截图。\n问题记录：汇总验收过程中发现的缺陷（如Bug清单、未达标项），并注明整改计划与预计完成时间。\n附件清单：列出所有提交的支撑文件（如日志、测试用例、第三方认证等），确保可追溯。",
        description="任务内容"
    )
    report_name: str = Field("XX项目阶段交付验收报告", description="报告名称")
    report_address: str = Field("北京市丰台区看丹街道看丹路418号", description="报告地址")
    supplement: str = Field("补充一", description="补充说明")
    attachments: List[Dict] = Field(default_factory=list, description="附件列表")


class MobileTaskRequest(BaseModel):
    """手机号任务请求模型"""
    # 手动输入模式
    mobiles: List[str] = Field(default_factory=list, description="手动输入的手机号列表")
    # 文件上传模式
    file_content: Optional[str] = Field(None, description="TXT文件内容(base64编码)")
    range: Optional[str] = Field(None, description="号码范围，如'1-50'")
    # 任务配置
    task_info: MobileTaskInfo = Field(..., description="任务信息")
    mode: Optional[int] = Field(None, description="操作模式: None-完整流程, 1-登录+报名, 2-登录+提交交付物, 3-登录+确认结算")
    concurrent_workers: int = Field(5, ge=1, le=50, description="并发工作线程数")
    interval_seconds: float = Field(0.5, ge=0, description="顺序执行间隔时间(秒)")
    environment: Optional[str] = Field(None, description="运行环境: test-测试, prod-生产, local-本地")


class MobileTaskResultItem(BaseModel):
    """单个手机号任务结果"""
    mobile: str = Field(..., description="手机号")
    success: bool = Field(..., description="是否成功")
    error: Optional[str] = Field(None, description="错误信息")
    steps: Dict[str, Any] = Field(default_factory=dict, description="各步骤执行结果")


class MobileTaskResponse(BaseModel):
    """手机号任务响应模型"""
    success: bool = Field(..., description="是否整体成功")
    message: str = Field(..., description="处理信息")
    data: List[MobileTaskResultItem] = Field(default_factory=list, description="任务结果列表")
    request_id: str = Field(..., description="请求ID")
    total: int = Field(..., description="总处理数量")
    success_count: int = Field(..., description="成功数量")
    failure_count: int = Field(..., description="失败数量")

# 简化的手机号解析请求模型
class MobileParseRequest(BaseModel):
    file_content: str = Field(..., description="base64编码的TXT文件内容")
    range: Optional[str] = Field(None, description="处理范围，如1-50，仅对文件有效")

# 手机号解析响应数据模型
class MobileParseData(BaseModel):
    mobiles: List[str] = Field(..., description="解析后的手机号列表")
    count: int = Field(..., description="手机号数量")

# 手机号解析响应模型
class MobileParseResponse(BaseModel):
    success: bool = Field(..., description="是否成功")
    message: str = Field(..., description="处理信息")
    data: Optional[MobileParseData] = Field(None, description="解析结果")
    request_id: str = Field(..., description="请求ID")


# 短信相关模型
class SMSTemplateItem(BaseModel):
    id: int = Field(..., description="模板ID")
    name: str = Field(..., description="模板名称")
    code: str = Field(..., description="模板编码")
    content: str = Field(..., description="模板内容")
    params: List[str] = Field(..., description="模板参数列表")


class SMSBaseRequest(BaseModel):
    environment: Literal["test", "prod"] = Field(..., description="环境")
    timeout: int = Field(15, ge=5, le=60, description="超时时间(秒)")


class SMSSendSingleRequest(SMSBaseRequest):
    template_code: str = Field(..., description="模板编码")
    use_preset_mobiles: bool = Field(True, description="是否使用预设手机号")
    mobiles: List[str] = Field(default_factory=list, description="手机号列表，use_preset_mobiles为False时必填")
    params: Dict[str, str] = Field(..., description="模板参数")


class SMSBatchSendRequest(SMSBaseRequest):
    template_codes: List[str] = Field(..., description="选中的模板编码列表")
    use_preset_mobiles: bool = Field(True, description="是否使用预设手机号")
    mobiles: List[str] = Field(default_factory=list, description="手机号列表，use_preset_mobiles为False时必填")
    random_send: bool = Field(False, description="是否随机选择手机号发送")


class SMSResendRequest(SMSBaseRequest):
    batch_no: Optional[str] = Field(None, description="批次号")
    mobiles: Optional[List[str]] = Field(None, description="手机号列表，与batch_no二选一")
    tax_id: int = Field(None, description="税地ID")

class AllowedSMSTemplateItem(BaseModel):
    code: str = Field(..., description="模板编码")
    name: str = Field(..., description="模板名称")

class SMSTemplateResponse(BaseModel):
    success: bool = Field(..., description="是否成功")
    message: str = Field(..., description="处理信息")
    data: Optional[List[AllowedSMSTemplateItem]] = Field(None, description="模板列表")
    request_id: str = Field(..., description="请求ID")


class SMSSendResponse(BaseModel):
    success: bool = Field(..., description="是否成功")
    message: str = Field(..., description="处理信息")
    data: List[Dict[str, Any]] = Field(..., description="发送结果")
    request_id: str = Field(..., description="请求ID")
    total: int = Field(..., description="总发送数量")
    success_count: int = Field(..., description="成功数量")
    failure_count: int = Field(..., description="失败数量")


class SMSResendDataItem(BaseModel):
    name: str = Field(..., description="姓名")
    mobile: str = Field(..., description="手机号")
    worker_id: int = Field(..., description="工人ID")
    tax_id: int = Field(..., description="税地ID")
    deadline: str = Field(..., description="截止日期")


class SMSResendResponse(BaseModel):
    success: bool = Field(..., description="是否成功")
    message: str = Field(..., description="处理信息")
    data: List[Dict[str, Any]] = Field(..., description="补发结果")
    request_id: str = Field(..., description="请求ID")
    workers: List[SMSResendDataItem] = Field(..., description="补发人员列表")


# 在app/models.py中添加（可放在文件末尾）
class EnterpriseListItem(BaseModel):
    """企业列表项模型"""
    id: int = Field(..., description="企业ID")
    enterprise_name: str = Field(..., description="企业名称")
    channel_id: Optional[int] = Field(None, description="渠道ID，可能为None")
    tenant_id: Optional[int] = Field(None, description="租户ID，可能为None")
    status: int = Field(..., description="企业状态")
    create_time: datetime = Field(..., description="创建时间")
    contact_person: Optional[str] = Field(None, description="联系人")
    contact_phone: Optional[str] = Field(None, description="联系电话")


class EnterpriseListResponse(BaseModel):
    """企业列表响应模型"""
    success: bool = Field(..., description="是否成功")
    message: str = Field(..., description="处理信息")
    data: List[EnterpriseListItem] = Field(..., description="企业列表")
    total: int = Field(..., description="企业总数")
    request_id: str = Field(..., description="请求ID")


class TaxDataRequest(BaseModel):
    """完税数据查询请求模型"""
    year_month: str = Field(..., description="年月，格式YYYY-MM")
    enterprise_ids: Optional[Union[int, List[int], str]] = Field(None, description="企业ID，可为单个ID、ID列表或逗号分隔字符串")
    amount_type: int = Field(1, ge=1, le=3, description="金额类型：1=含服务费, 2=不含服务费, 3=账单金额")
    environment: Optional[Literal["test", "prod", "local"]] = Field(None, description="环境")
    timeout: int = Field(30, ge=10, le=60, description="超时时间(秒)")


class TaxDataItem(BaseModel):
    """完税数据项模型"""
    纳税人姓名: str = Field(..., description="纳税人姓名")
    身份证号: str = Field(..., description="身份证号")
    营业额_元: float = Field(..., description="营业额(元)")
    enterprise_name: str = Field(..., description="企业名称")
    enterprise_id: int = Field(..., description="企业ID")
    tax_amount: Optional[float] = Field(None, description="税额，可能为None")
    增值税_元: float = Field(..., description="增值税(元)")
    教育费附加_元: float = Field(..., description="教育费附加(元)")
    地方教育附加_元: float = Field(..., description="地方教育附加(元)")
    城市维护建设费_元: float = Field(..., description="城市维护建设费(元)")
    个人经营所得税税率: float = Field(..., description="个人经营所得税税率")
    应纳个人经营所得税_元: float = Field(..., description="应纳个人经营所得税(元)")
    税地ID: int = Field(..., description="税地ID")
    税地名称: str = Field(..., description="税地名称")
    service_pay_status: int = Field(..., description="服务费收取状态")
    tax_pay_status: int = Field(..., description="税金结算状态")
    备注: str = Field(..., description="备注")


class TaxDataResponse(BaseModel):
    """完税数据响应模型"""
    success: bool = Field(..., description="是否成功")
    message: str = Field(..., description="处理信息")
    data: List[TaxDataItem] = Field(..., description="完税数据列表")
    total: int = Field(..., description="数据总数")
    request_id: str = Field(..., description="请求ID")


class TaxReportGenerateRequest(BaseModel):
    """税务报表生成请求模型"""
    year_month: str = Field(..., description="年月，格式YYYY-MM")
    # output_path: str = Field(..., description="报表输出路径")
    enterprise_ids: Optional[Union[int, List[int], str]] = Field(None, description="企业ID，可为单个ID、ID列表或逗号分隔字符串")
    amount_type: int = Field(1, ge=1, le=3, description="金额类型：1=含服务费, 2=不含服务费, 3=账单金额")
    platform_company: Optional[str] = Field(None, description="平台企业名称，默认：云策企服（驻马店）人力资源服务有限公司")
    credit_code: Optional[str] = Field(None, description="社会统一信用代码，默认：91411700MAEFDQ7P7T")
    environment: Optional[Literal["test", "prod", "local"]] = Field(None, description="环境")
    timeout: int = Field(60, ge=30, le=300, description="超时时间(秒)")


class TaxReportGenerateResponse(BaseModel):
    """税务报表生成响应模型"""
    success: bool = Field(..., description="是否成功")
    message: str = Field(..., description="处理信息")
    data: Dict[str, str] = Field(..., description="生成结果，包含文件路径")
    request_id: str = Field(..., description="请求ID")


# 在文件末尾添加
class TaxCalculationRequest(BaseModel):
    """税额计算请求模型"""
    year: int = Field(..., ge=2000, le=2100, description="年份")
    batch_no: Optional[str] = Field(None, description="批次号")
    credential_num: Optional[str] = Field(None, description="身份证号")
    realname: Optional[str] = Field(None, description="姓名")
    income_type: int = Field(1, ge=1, le=2, description="收入类型: 1-劳务报酬, 2-工资薪金")
    accumulated_special_deduction: float = Field(0.0, ge=0, description="累计专项扣除")
    accumulated_additional_deduction: float = Field(0.0, ge=0, description="累计专项附加扣除")
    accumulated_other_deduction: float = Field(0.0, ge=0, description="累计其他扣除")
    accumulated_pension_deduction: float = Field(0.0, ge=0, description="累计个人养老金")
    accumulated_donation_deduction: float = Field(0.0, ge=0, description="累计准予扣除的捐赠额")
    environment: Optional[Literal["test", "prod", "local"]] = Field(None, description="环境")
    use_mock: bool = Field(False, description="是否使用模拟数据")
    mock_data: Optional[List[Dict]] = Field(None, description="模拟数据（仅当use_mock=True时有效）")


class TaxCalculationResultItem(BaseModel):
    """税额计算结果项"""
    batch_no: str = Field(..., description="批次号")
    credential_num: str = Field(..., description="身份证号")
    realname: str = Field(..., description="姓名")
    worker_id: int = Field(..., description="用户ID")
    year_month: str = Field(..., description="年月")
    bill_amount: float = Field(..., description="账单金额")
    tax: float = Field(..., description="本次应缴税额")
    income_type: int = Field(..., description="收入类型")
    income_type_name: str = Field(..., description="收入类型名称")
    income_amount: float = Field(..., description="收入金额")
    prev_accumulated_income: float = Field(..., description="上期累计收入额")
    accumulated_income: float = Field(..., description="累计收入额")
    revenue_bills: float = Field(..., description="累计收入（原始累计）")
    accumulated_months: int = Field(..., description="累计月份数")
    accumulated_deduction: float = Field(..., description="累计减除费用")
    accumulated_taxable: float = Field(..., description="应纳税所得额")
    accumulated_special: float = Field(..., description="累计专项扣除")
    accumulated_additional: float = Field(..., description="累计专项附加扣除")
    accumulated_other: float = Field(..., description="累计其他扣除")
    accumulated_pension: float = Field(..., description="累计个人养老金")
    accumulated_donation: float = Field(..., description="累计准予扣除的捐赠额")
    tax_rate: float = Field(..., description="税率")
    quick_deduction: float = Field(..., description="速算扣除数")
    accumulated_total_tax: float = Field(..., description="累计应纳税额")
    prev_accumulated_tax: float = Field(..., description="上期累计已缴税额")
class SMSTemplateItem(BaseModel):
    id: int = Field(..., description="模板ID")
    name: str = Field(..., description="模板名称")
    code: str = Field(..., description="模板编码")
    content: str = Field(..., description="模板内容")
    params: List[str] = Field(..., description="模板参数列表")


class SMSBaseRequest(BaseModel):
    environment: Literal["test", "prod"] = Field(..., description="环境")
    timeout: int = Field(15, ge=5, le=60, description="超时时间(秒)")


class SMSSendSingleRequest(SMSBaseRequest):
    template_code: str = Field(..., description="模板编码")
    use_preset_mobiles: bool = Field(True, description="是否使用预设手机号")
    mobiles: List[str] = Field(default_factory=list, description="手机号列表，use_preset_mobiles为False时必填")
    params: Dict[str, str] = Field(..., description="模板参数")


class SMSBatchSendRequest(SMSBaseRequest):
    template_codes: List[str] = Field(..., description="选中的模板编码列表")
    use_preset_mobiles: bool = Field(True, description="是否使用预设手机号")
    mobiles: List[str] = Field(default_factory=list, description="手机号列表，use_preset_mobiles为False时必填")
    random_send: bool = Field(False, description="是否随机选择手机号发送")


class SMSResendRequest(SMSBaseRequest):
    batch_no: Optional[str] = Field(None, description="批次号")
    mobiles: Optional[List[str]] = Field(None, description="手机号列表，与batch_no二选一")
    tax_id: int = Field(None, description="税地ID")

class AllowedSMSTemplateItem(BaseModel):
    code: str = Field(..., description="模板编码")
    name: str = Field(..., description="模板名称")

class SMSTemplateResponse(BaseModel):
    success: bool = Field(..., description="是否成功")
    message: str = Field(..., description="处理信息")
    data: Optional[List[AllowedSMSTemplateItem]] = Field(None, description="模板列表")
    request_id: str = Field(..., description="请求ID")


class SMSSendResponse(BaseModel):
    success: bool = Field(..., description="是否成功")
    message: str = Field(..., description="处理信息")
    data: List[Dict[str, Any]] = Field(..., description="发送结果")
    request_id: str = Field(..., description="请求ID")
    total: int = Field(..., description="总发送数量")
    success_count: int = Field(..., description="成功数量")
    failure_count: int = Field(..., description="失败数量")


class SMSResendDataItem(BaseModel):
    name: str = Field(..., description="姓名")
    mobile: str = Field(..., description="手机号")
    worker_id: int = Field(..., description="工人ID")
    tax_id: int = Field(..., description="税地ID")
    deadline: str = Field(..., description="截止日期")


class SMSResendResponse(BaseModel):
    success: bool = Field(..., description="是否成功")
    message: str = Field(..., description="处理信息")
    data: List[Dict[str, Any]] = Field(..., description="补发结果")
    request_id: str = Field(..., description="请求ID")
    workers: List[SMSResendDataItem] = Field(..., description="补发人员列表")


# 在app/models.py中添加（可放在文件末尾）
class EnterpriseListItem(BaseModel):
    """企业列表项模型"""
    id: int = Field(..., description="企业ID")
    enterprise_name: str = Field(..., description="企业名称")
    channel_id: Optional[int] = Field(None, description="渠道ID，可能为None")
    tenant_id: Optional[int] = Field(None, description="租户ID，可能为None")
    status: int = Field(..., description="企业状态")
    create_time: datetime = Field(..., description="创建时间")
    contact_person: Optional[str] = Field(None, description="联系人")
    contact_phone: Optional[str] = Field(None, description="联系电话")


class EnterpriseListResponse(BaseModel):
    """企业列表响应模型"""
    success: bool = Field(..., description="是否成功")
    message: str = Field(..., description="处理信息")
    data: List[EnterpriseListItem] = Field(..., description="企业列表")
    total: int = Field(..., description="企业总数")
    request_id: str = Field(..., description="请求ID")


class TaxDataRequest(BaseModel):
    """完税数据查询请求模型"""
    year_month: str = Field(..., description="年月，格式YYYY-MM")
    enterprise_ids: Optional[Union[int, List[int], str]] = Field(None, description="企业ID，可为单个ID、ID列表或逗号分隔字符串")
    amount_type: int = Field(1, ge=1, le=3, description="金额类型：1=含服务费, 2=不含服务费, 3=账单金额")
    environment: Optional[Literal["test", "prod", "local"]] = Field(None, description="环境")
    timeout: int = Field(30, ge=10, le=60, description="超时时间(秒)")


class TaxDataItem(BaseModel):
    """完税数据项模型"""
    纳税人姓名: str = Field(..., description="纳税人姓名")
    身份证号: str = Field(..., description="身份证号")
    营业额_元: float = Field(..., description="营业额(元)")
    enterprise_name: str = Field(..., description="企业名称")
    enterprise_id: int = Field(..., description="企业ID")
    tax_amount: Optional[float] = Field(None, description="税额，可能为None")
    增值税_元: float = Field(..., description="增值税(元)")
    教育费附加_元: float = Field(..., description="教育费附加(元)")
    地方教育附加_元: float = Field(..., description="地方教育附加(元)")
    城市维护建设费_元: float = Field(..., description="城市维护建设费(元)")
    个人经营所得税税率: float = Field(..., description="个人经营所得税税率")
    应纳个人经营所得税_元: float = Field(..., description="应纳个人经营所得税(元)")
    税地ID: int = Field(..., description="税地ID")
    税地名称: str = Field(..., description="税地名称")
    service_pay_status: int = Field(..., description="服务费收取状态")
    tax_pay_status: int = Field(..., description="税金结算状态")
    备注: str = Field(..., description="备注")


class TaxDataResponse(BaseModel):
    """完税数据响应模型"""
    success: bool = Field(..., description="是否成功")
    message: str = Field(..., description="处理信息")
    data: List[TaxDataItem] = Field(..., description="完税数据列表")
    total: int = Field(..., description="数据总数")
    request_id: str = Field(..., description="请求ID")


class TaxReportGenerateRequest(BaseModel):
    """税务报表生成请求模型"""
    year_month: str = Field(..., description="年月，格式YYYY-MM")
    # output_path: str = Field(..., description="报表输出路径")
    enterprise_ids: Optional[Union[int, List[int], str]] = Field(None, description="企业ID，可为单个ID、ID列表或逗号分隔字符串")
    amount_type: int = Field(1, ge=1, le=3, description="金额类型：1=含服务费, 2=不含服务费, 3=账单金额")
    platform_company: Optional[str] = Field(None, description="平台企业名称，默认：云策企服（驻马店）人力资源服务有限公司")
    credit_code: Optional[str] = Field(None, description="社会统一信用代码，默认：91411700MAEFDQ7P7T")
    environment: Optional[Literal["test", "prod", "local"]] = Field(None, description="环境")
    timeout: int = Field(60, ge=30, le=300, description="超时时间(秒)")


class TaxReportGenerateResponse(BaseModel):
    """税务报表生成响应模型"""
    success: bool = Field(..., description="是否成功")
    message: str = Field(..., description="处理信息")
    data: Dict[str, str] = Field(..., description="生成结果，包含文件路径")
    request_id: str = Field(..., description="请求ID")


# 在文件末尾添加
class TaxCalculationRequest(BaseModel):
    """税额计算请求模型"""
    year: int = Field(..., ge=2000, le=2100, description="年份")
    batch_no: Optional[str] = Field(None, description="批次号")
    credential_num: Optional[str] = Field(None, description="身份证号")
    realname: Optional[str] = Field(None, description="姓名")
    income_type: int = Field(1, ge=1, le=2, description="收入类型: 1-劳务报酬, 2-工资薪金")
    accumulated_special_deduction: float = Field(0.0, ge=0, description="累计专项扣除")
    accumulated_additional_deduction: float = Field(0.0, ge=0, description="累计专项附加扣除")
    accumulated_other_deduction: float = Field(0.0, ge=0, description="累计其他扣除")
    accumulated_pension_deduction: float = Field(0.0, ge=0, description="累计个人养老金")
    accumulated_donation_deduction: float = Field(0.0, ge=0, description="累计准予扣除的捐赠额")
    environment: Optional[Literal["test", "prod", "local"]] = Field(None, description="环境")
    use_mock: bool = Field(False, description="是否使用模拟数据")
    mock_data: Optional[List[Dict]] = Field(None, description="模拟数据（仅当use_mock=True时有效）")


class TaxCalculationResultItem(BaseModel):
    """税额计算结果项"""
    batch_no: str = Field(..., description="批次号")
    credential_num: str = Field(..., description="身份证号")
    realname: str = Field(..., description="姓名")
    worker_id: int = Field(..., description="用户ID")
    year_month: str = Field(..., description="年月")
    bill_amount: float = Field(..., description="账单金额")
    tax: float = Field(..., description="本次应缴税额")
    income_type: int = Field(..., description="收入类型")
    income_type_name: str = Field(..., description="收入类型名称")
    income_amount: float = Field(..., description="收入金额")
    prev_accumulated_income: float = Field(..., description="上期累计收入额")
    accumulated_income: float = Field(..., description="累计收入额")
    revenue_bills: float = Field(..., description="累计收入（原始累计）")
    accumulated_months: int = Field(..., description="累计月份数")
    accumulated_deduction: float = Field(..., description="累计减除费用")
    accumulated_taxable: float = Field(..., description="应纳税所得额")
    accumulated_special: float = Field(..., description="累计专项扣除")
    accumulated_additional: float = Field(..., description="累计专项附加扣除")
    accumulated_other: float = Field(..., description="累计其他扣除")
    accumulated_pension: float = Field(..., description="累计个人养老金")
    accumulated_donation: float = Field(..., description="累计准予扣除的捐赠额")
    tax_rate: float = Field(..., description="税率")
    quick_deduction: float = Field(..., description="速算扣除数")
    accumulated_total_tax: float = Field(..., description="累计应纳税额")
    prev_accumulated_tax: float = Field(..., description="上期累计已缴税额")
    accumulated_tax: float = Field(..., description="累计已缴税额")
    calculation_steps: List[str] = Field(..., description="计算步骤")
    effective_tax_rate: float = Field(..., description="实际税负")


class TaxCalculationResponse(BaseModel):
    """税额计算响应模型"""
    success: bool = Field(..., description="是否成功")
    message: str = Field(..., description="处理信息")
    data: Optional[List[TaxCalculationResultItem]] = Field(None, description="计算结果")
    request_id: str = Field(..., description="请求ID")
    total_tax: float = Field(..., description="总税额")


# OCR相关模型
class OCRProcessRequest(BaseModel):
    """OCR处理请求模型"""
    excel_path: str = Field(..., description="个人信息表Excel文件路径")
    source_folder: str = Field(..., description="附件文件夹路径")
    target_excel_path: str = Field(..., description="结果输出Excel文件路径")
    mode: int = Field(1, ge=1, le=2, description="运行模式: 1=按Excel顺序, 2=按附件识别")


class OCRProcessResponse(BaseModel):
    """OCR处理响应模型"""
    success: bool = Field(..., description="是否处理成功")
    message: str = Field(..., description="处理信息")
    logs: List[str] = Field(default_factory=list, description="执行日志")