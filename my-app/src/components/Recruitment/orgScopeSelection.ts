import type {ScriptHubOrganizationDefinition} from "@/lib/types";

export const ALL_COMPANY_DEPARTMENTS_VALUE = "__all_company_departments__";

export type RecruitmentOrgScopeSelection = {
    orgScope: string;
    departmentScope: string;
};

type RecruitmentOrgScopeCatalog = {
    defaultOrgScope: string;
    hasAllOrgScope: boolean;
    organizationCatalog: ScriptHubOrganizationDefinition[];
    visibleOrgCodes: string[];
};

export function normalizeRecruitmentOrgCode(value?: string | null) {
    const text = String(value || "").trim();
    return text || "group";
}

export function isCompanyLikeOrganization(organization?: ScriptHubOrganizationDefinition | null) {
    const type = String(organization?.org_type || "").toLowerCase();
    return type === "company" || type === "sub_group" || type === "group";
}

export function isDepartmentOrganization(organization?: ScriptHubOrganizationDefinition | null) {
    return String(organization?.org_type || "").toLowerCase() === "department";
}

export function isOrganizationInScope(
    organizations: Map<string, ScriptHubOrganizationDefinition>,
    scopeCode: string,
    orgCode: string,
) {
    const normalizedScopeCode = normalizeRecruitmentOrgCode(scopeCode);
    const normalizedOrgCode = normalizeRecruitmentOrgCode(orgCode);
    if (normalizedScopeCode === normalizedOrgCode) {
        return true;
    }
    const scope = organizations.get(normalizedScopeCode);
    const organization = organizations.get(normalizedOrgCode);
    return Boolean(scope && organization && String(organization.path || "").startsWith(`${scope.path}/`));
}

export function findCompanyScopeCodeForOrg(
    orgCode: string,
    organizations: Map<string, ScriptHubOrganizationDefinition>,
) {
    let current = organizations.get(normalizeRecruitmentOrgCode(orgCode));
    const visited = new Set<string>();
    while (current && !visited.has(current.org_code)) {
        visited.add(current.org_code);
        if (isCompanyLikeOrganization(current)) {
            return current.org_code;
        }
        current = current.parent_org_code ? organizations.get(current.parent_org_code) : undefined;
    }
    return normalizeRecruitmentOrgCode(orgCode);
}

export function sortOrganizationCodes(
    codes: string[],
    organizations: Map<string, ScriptHubOrganizationDefinition>,
) {
    return [...new Set(codes.map(normalizeRecruitmentOrgCode))].sort((left, right) => {
        const leftOrg = organizations.get(left);
        const rightOrg = organizations.get(right);
        const leftOrder = leftOrg?.sort_order ?? 9999;
        const rightOrder = rightOrg?.sort_order ?? 9999;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return (leftOrg?.path || left).localeCompare(rightOrg?.path || right);
    });
}

export function resolveVisibleOrgCodes(
    visibleOrgCodes: string[],
    defaultOrgScope: string,
    organizations: Map<string, ScriptHubOrganizationDefinition>,
) {
    return sortOrganizationCodes(
        visibleOrgCodes.length ? visibleOrgCodes : [defaultOrgScope],
        organizations,
    );
}

export function resolveCompanyScopeCodes({
    defaultOrgScope,
    hasAllOrgScope,
    organizationCatalog,
    visibleOrgCodes,
}: RecruitmentOrgScopeCatalog) {
    const organizations = new Map(
        organizationCatalog.map((organization) => [organization.org_code, organization]),
    );
    const resolvedVisibleOrgCodes = resolveVisibleOrgCodes(
        visibleOrgCodes,
        defaultOrgScope,
        organizations,
    );
    const companyCodes = new Set<string>();

    if (hasAllOrgScope) {
        organizationCatalog
            .filter((organization) => organization.is_active !== false && isCompanyLikeOrganization(organization))
            .forEach((organization) => companyCodes.add(organization.org_code));
    }

    resolvedVisibleOrgCodes.forEach((orgCode) => {
        const organization = organizations.get(orgCode);
        if (hasAllOrgScope && organization && !isCompanyLikeOrganization(organization)) {
            return;
        }
        companyCodes.add(findCompanyScopeCodeForOrg(orgCode, organizations));
    });

    if (!companyCodes.size) {
        companyCodes.add(findCompanyScopeCodeForOrg(defaultOrgScope, organizations));
    }

    return sortOrganizationCodes([...companyCodes], organizations);
}

export function resolveSelectedCompanyOrgCodes(
    selectedOrgScope: string,
    visibleOrgCodes: string[],
    organizations: Map<string, ScriptHubOrganizationDefinition>,
) {
    const selectedCompanyCode = normalizeRecruitmentOrgCode(selectedOrgScope);
    const scopedCodes = visibleOrgCodes.filter((orgCode) => (
        orgCode === selectedCompanyCode
        || isOrganizationInScope(organizations, selectedCompanyCode, orgCode)
    ));
    return scopedCodes.length ? scopedCodes : [selectedCompanyCode];
}

export function resolveDepartmentScopeValues(
    selectedOrgScope: string,
    visibleOrgCodes: string[],
    organizations: Map<string, ScriptHubOrganizationDefinition>,
) {
    const selectedCompanyOrgCodes = resolveSelectedCompanyOrgCodes(
        selectedOrgScope,
        visibleOrgCodes,
        organizations,
    );
    const departmentCodes = selectedCompanyOrgCodes.filter((orgCode) => (
        isDepartmentOrganization(organizations.get(orgCode))
    ));
    const selectedCompanyCode = normalizeRecruitmentOrgCode(selectedOrgScope);
    const selectedCompanyIsVisible = selectedCompanyOrgCodes.some((orgCode) => orgCode === selectedCompanyCode);
    const values: string[] = [];
    if (departmentCodes.length && (selectedCompanyIsVisible || departmentCodes.length > 1)) {
        values.push(ALL_COMPANY_DEPARTMENTS_VALUE);
    }
    values.push(...departmentCodes);
    return values;
}

export function validateRecruitmentOrgScopeSelection(
    selection: RecruitmentOrgScopeSelection,
    catalog: RecruitmentOrgScopeCatalog,
): RecruitmentOrgScopeSelection {
    const organizations = new Map(
        catalog.organizationCatalog.map((organization) => [organization.org_code, organization]),
    );
    const visibleOrgCodes = resolveVisibleOrgCodes(
        catalog.visibleOrgCodes,
        catalog.defaultOrgScope,
        organizations,
    );
    const companyScopeCodes = resolveCompanyScopeCodes(catalog);
    const requestedOrgScope = normalizeRecruitmentOrgCode(selection.orgScope);
    const defaultCompanyScope = findCompanyScopeCodeForOrg(catalog.defaultOrgScope, organizations);
    const orgScope = companyScopeCodes.includes(requestedOrgScope)
        ? requestedOrgScope
        : (companyScopeCodes.includes(defaultCompanyScope) ? defaultCompanyScope : companyScopeCodes[0]);
    const resolvedOrgScope = orgScope || defaultCompanyScope;
    const departmentScopeValues = resolveDepartmentScopeValues(
        resolvedOrgScope,
        visibleOrgCodes,
        organizations,
    );
    const requestedDepartmentScope = String(selection.departmentScope || "").trim()
        || ALL_COMPANY_DEPARTMENTS_VALUE;

    let departmentScope = requestedDepartmentScope;
    if (!departmentScopeValues.length) {
        departmentScope = ALL_COMPANY_DEPARTMENTS_VALUE;
    } else if (!departmentScopeValues.includes(requestedDepartmentScope)) {
        departmentScope = departmentScopeValues.includes(ALL_COMPANY_DEPARTMENTS_VALUE)
            ? ALL_COMPANY_DEPARTMENTS_VALUE
            : departmentScopeValues[0];
    }

    return {orgScope: resolvedOrgScope, departmentScope};
}

export function isSameRecruitmentOrgScope(
    left: RecruitmentOrgScopeSelection,
    right: RecruitmentOrgScopeSelection,
) {
    return left.orgScope === right.orgScope && left.departmentScope === right.departmentScope;
}
