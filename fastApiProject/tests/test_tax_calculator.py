from app.tax_calculator import TaxCalculator


def test_salary_income_never_generates_vat_or_surcharges():
    calculator = TaxCalculator(
        db_config={},
        mock_data=[{"year_month": "2025-01", "bill_amount": 120000}],
    )

    results = calculator.calculate_tax_by_batch(
        year=2025,
        credential_num="310101199001011234",
        realname="测试",
        use_mock=True,
        income_type=2,
        city_tax_rate=7.0,
        education_surcharge_rate=3.0,
        local_education_surcharge_rate=2.0,
        lang="zh-CN",
    )

    assert len(results) == 1
    assert float(results[0]["vat_tax"]) == 0.0
    assert float(results[0]["surcharges"]) == 0.0
    assert float(results[0]["total_tax_and_fees"]) == float(results[0]["tax"])


def test_labor_income_uses_monthly_cumulative_amount_for_vat_threshold():
    calculator = TaxCalculator(
        db_config={},
        mock_data=[
            {"year_month": "2025-01", "bill_amount": 50000},
            {"year_month": "2025-01", "bill_amount": 60000},
            {"year_month": "2025-02", "bill_amount": 20000},
        ],
    )

    results = calculator.calculate_tax_by_batch(
        year=2025,
        credential_num="310101199001011234",
        realname="测试",
        use_mock=True,
        income_type=1,
        city_tax_rate=7.0,
        education_surcharge_rate=3.0,
        local_education_surcharge_rate=2.0,
        lang="zh-CN",
    )

    assert len(results) == 3

    january_first = results[0]
    january_second = results[1]
    february = results[2]

    assert january_first["year_month"] == "2025-01"
    assert float(january_first["vat_tax"]) == 0.0
    assert float(january_first["surcharges"]) == 0.0

    assert january_second["year_month"] == "2025-01"
    assert float(january_second["vat_tax"]) == 1089.11
    assert float(january_second["surcharges"]) == 65.35
    assert any("劳务报酬当月累计金额超过10万" in step for step in january_second["calculation_steps"])

    assert february["year_month"] == "2025-02"
    assert float(february["vat_tax"]) == 0.0
    assert float(february["surcharges"]) == 0.0
