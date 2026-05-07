# Testing Patterns

**Analysis Date:** 2026-04-19

## Test Frameworks

**Python (fastApiProject):**
- Framework: **pytest** (version 8.3.5)
- Config: No `pytest.ini` or `pyproject.toml` found; defaults applied
- Mocking: `unittest.mock` (built-in)

**TypeScript (my-app):**
- Framework: **Node.js built-in test runner** (`node:test`)
- Assertion: `node:assert/strict`
- No Jest, Vitest, or other test frameworks detected in project

---

## Python Tests (fastApiProject)

### Location

```
fastApiProject/tests/
├── conftest.py                  # Shared fixtures
├── test_settlement_service.py
├── test_tax_calculator.py
├── test_bootstrap_resources_recruitment.py
├── test_bootstrap_access_keys.py
├── test_monitoring_service.py
├── test_recruitment_screening_queue.py
├── test_route_permissions.py
├── test_screening_validation.py
├── test_script_hub_rbac_overrides.py
├── test_team_resource_service.py
```

### Naming Convention

- Test files: `test_*.py`
- Test classes: `Test*` (PascalCase)
- Test functions: `test_*` (snake_case)

### Fixtures (conftest.py)

Location: `fastApiProject/tests/conftest.py`

```python
@pytest.fixture
def settlement_service():
    return EnterpriseSettlementService(base_url="http://test-api.example.com")

@pytest.fixture
def sample_settlement_request():
    return SettlementRequest(
        environment="test",
        mode=1,
        concurrent_workers=1,
        interval_seconds=0,
        enterprises=[
            EnterpriseTaskBase(
                name="Test Enterprise",
                token="test-token",
                tenant_id="123",
                tax_id="456",
                items1=["B001"],
                items2=[],
                items3={}
            )
        ]
    )
```

### Test Patterns

**Unit Test with mocking:**
```python
from unittest.mock import MagicMock, patch

class TestEnterpriseSettlementService:
    
    @patch('app.services.settlement_service.requests.post')
    def test_launch_batch_success(self, mock_post, settlement_service):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"code": 0, "msg": "success", "data": "123"}
        mock_post.return_value = mock_response

        headers = {"Authorization": "Bearer token"}
        result = settlement_service._launch_batch(headers, "B001", "Test Ent")

        assert result["batch_no"] == "B001"
        assert result["result"]["success"] is True
```

**Test with mock data (no external dependencies):**
```python
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
```

**Dynamic module loading for testing bootstrap scripts:**
```python
def _load_bootstrap_resources_module():
    repo_root = Path(__file__).resolve().parents[2]
    module_path = repo_root / "bootstrap_resources_recruitment.py"
    repo_root_str = str(repo_root)
    if repo_root_str not in sys.path:
        sys.path.insert(0, repo_root_str)
    spec = importlib.util.spec_from_file_location("bootstrap_resources_recruitment", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load bootstrap_resources_recruitment.py")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def test_load_rbac_seed_falls_back_to_default_when_file_missing():
    module = _load_bootstrap_resources_module()
    seed, using_seed_file = module.load_rbac_seed(None)
    assert using_seed_file is False
```

### Running Python Tests

```bash
# Run all tests
cd fastApiProject && pytest

# Run specific test file
pytest tests/test_settlement_service.py

# Run with coverage (if pytest-cov installed)
pytest --cov=app tests/
```

---

## TypeScript Tests (my-app)

### Location

```
my-app/src/components/Recruitment/pages/
├── auditFlowDetails.test.mjs
└── auditNotice.test.mjs
```

**Note:** Very limited test coverage in frontend. Most testing is manual or via TypeScript type checking.

### Naming Convention

- Test files: `*.test.mjs` (Node test runner format)

### Test Patterns

**Using Node.js built-in test runner:**
```javascript
import assert from "node:assert/strict";
import test from "node:test";

import {buildScreeningFlowAuditView} from "./auditFlowDetails.ts";

test("screening_flow detail view falls back to parse and score child logs when root lacks model details", () => {
    const rootLog = {
        id: 1001,
        task_type: "screening_flow",
        // ...
    };
    const parseChild = { /* ... */ };
    const scoreChild = { /* ... */ };

    const view = buildScreeningFlowAuditView(rootLog, [rootLog, parseChild, scoreChild]);

    assert.equal(view.parseDetailLog?.id, 1002);
    assert.equal(view.scoreDetailLog?.id, 1003);
    assert.equal(view.inferredFromChildTerminal, true);
});
```

### Running TypeScript Tests

```bash
# Run Node.js tests
cd my-app && node --test src/components/Recruitment/pages/*.test.mjs

# TypeScript type checking (no runtime tests executed)
npx tsc --noEmit
```

---

## Type Checking

**Python:** No explicit type checking tool configured (mypy not in requirements)

**TypeScript:** TypeScript compiler (`tsc`) is configured:
```bash
# Run type check
cd my-app && npx tsc --noEmit

# Type check specific file
npx tsc --noEmit src/components/TaxCalculatorScript.tsx
```

---

## Test Coverage Observations

| Component | Test Framework | Coverage |
|-----------|--------------|----------|
| Python (fastApiProject) | pytest | Unit tests present for services, models, and utilities |
| TypeScript (my-app) | node:test | Minimal - only 2 test files found |

**Gaps:**
- No integration tests detected
- No E2E tests (Playwright not configured)
- Frontend has very limited test coverage

---

## CI/CD

**No CI/CD configuration detected** in the repository (no `.github/workflows/`, no `.gitlab-ci.yml`, no `Jenkinsfile`).

---

## Test Utilities Summary

**Python (fastApiProject):**
- `conftest.py` - pytest fixtures for `settlement_service` and `sample_settlement_request`
- `unittest.mock` - for mocking HTTP requests and external services
- `tmp_path` fixture - for temporary file system operations

**TypeScript (my-app):**
- `node:assert/strict` - assertions
- `node:test` - test runner
- No shared test utilities or fixtures detected

---

*Testing analysis: 2026-04-19*
