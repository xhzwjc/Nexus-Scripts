# Coding Conventions

**Analysis Date:** 2026-04-19

## Project Structure

**Two main codebases:**
- `fastApiProject/` - Python/FastAPI backend
- `my-app/` - TypeScript/Next.js frontend

---

## Python Conventions (fastApiProject)

### Style Guide

**Follow:** PEP 8 with type hints

**Type Hints:**
- Use `typing` module for complex types: `List`, `Dict`, `Optional`, `Tuple`, `Any`
- Use `from typing import ...` for clarity
- Example in `app/tax_calculator.py`:
  ```python
  from typing import List, Dict, Optional, Tuple, Any
  
  def get_records(self, credential_num: str, year: int, realname: Optional[str] = None) -> List[Dict]:
  ```

**Naming:**
- Functions: `snake_case`
- Classes: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- Private methods: `_leading_underscore`

**Imports:**
- Standard library first
- Third-party packages second
- Local application imports last
- Example from `app/services/settlement_service.py`:
  ```python
  import logging
  from typing import List, Dict, Any
  from .utils import DatabaseManager
  ```

**Logging:**
- Use `logging.getLogger(__name__)` at module level
- Example in `app/tax_calculator.py`:
  ```python
  logger = logging.getLogger(__name__)
  ```

**Error Handling:**
- Use try-except blocks
- Raise exceptions with descriptive messages
- Let exceptions propagate when appropriate

**Decimal Precision:**
- Use `Decimal` from `decimal` module for financial calculations
- Set precision globally: `getcontext().prec = 20`
- Example in `app/tax_calculator.py`:
  ```python
  from decimal import Decimal, getcontext, ROUND_HALF_UP
  getcontext().prec = 20
  ```

---

## TypeScript Conventions (my-app)

### Style Guide

**Follow:** Next.js/TypeScript defaults via ESLint

**ESLint Configuration** in `my-app/eslint.config.mjs`:
```javascript
const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];
```

**TypeScript Config** in `my-app/tsconfig.json`:
- `strict: true` enabled
- `ES2017` target
- Path alias: `@/*` maps to `./src/*`

**Type Hints:**
- Use `interface` for object shapes (component props, API responses)
- Use `type` for unions, intersections, utility types
- Example in `my-app/src/components/TaxCalculatorScript.tsx`:
  ```typescript
  interface MockRecord {
    id: string;
    year_month: string;
    bill_amount: number;
  }
  
  type TaxCalculationParams = MockTaxParams | RealTaxParams;
  ```

**Avoid `any`:**
- Use `unknown` for external/untrusted input, then narrow safely
- If `any` is required, document the reason

**Imports:**
- React imports first
- Third-party packages second
- Local imports last (using path aliases `@/`)

**Naming:**
- Components: `PascalCase.tsx`
- Utilities/hooks: `camelCase.ts`
- Test files: `*.test.mjs` or `*.spec.*`

**Component Patterns:**
- Define props with named interface
- Use named exports for components
- Example:
  ```typescript
  interface TaxCalculationScriptProps {
    onBack: () => void;
  }
  
  export default function TaxCalculationScript({ onBack }: TaxCalculationScriptProps) {
  ```

---

## Project-Specific Rules (RULES.md)

**Critical rules from `RULES.md`:**

1. **Language:** All responses in Chinese
2. **Before starting:** Read `ai_mistakes.md` and acknowledge the error patterns
3. **Before modifying code:** Check for violations of blacklisted patterns
4. **If `any` type needed:** Must document the reason
5. **Before deleting code:** Search for all references globally
6. **After modifying imports:** Verify all dependencies

**Python-specific rules:** R000, M002, M005
**TypeScript-specific rules:** R000, M001, M006, M007, M011
**Refactor/delete operations:** M003, M004, M010
**New features:** M006, M008

---

## File Organization

**Python (fastApiProject):**
```
fastApiProject/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI entry point
│   ├── models.py            # Pydantic models
│   ├── config.py            # Configuration
│   ├── database.py          # DB connection
│   ├── routers/             # API routes
│   ├── services/            # Business logic
│   └── utils.py             # Utilities
├── tests/                   # Unit tests
│   ├── conftest.py          # pytest fixtures
│   └── test_*.py            # Test files
└── alembic/                 # DB migrations
```

**TypeScript (my-app):**
```
my-app/
├── src/
│   ├── app/                 # Next.js App Router
│   ├── components/          # React components
│   │   ├── ui/             # Reusable UI components
│   │   └── *.tsx           # Page/script components
│   ├── lib/                # Utilities, API, auth
│   └── pages/              # Next.js Pages (legacy)
├── tsconfig.json
└── eslint.config.mjs
```

---

## API Patterns

**Response Format:**
```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    total: number;
    page: number;
    limit: number;
  };
}
```

---

## Immutability

**Python:** Create new objects instead of mutating:
```python
# WRONG
result.update({"key": "value"})  # mutation

# CORRECT
result = {**result, "key": "value"}  # new object
```

**TypeScript:** Use spread operator for immutable updates:
```typescript
// WRONG
function updateUser(user: User, name: string): User {
  user.name = name;  // MUTATION!
  return user;
}

// CORRECT
function updateUser(user: Readonly<User>, name: string): User {
  return { ...user, name };
}
```

---

*Convention analysis: 2026-04-19*
