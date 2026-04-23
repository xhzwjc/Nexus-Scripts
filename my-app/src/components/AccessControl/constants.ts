import type { AccessControlView, DataScope, ResourceDomain, ResourceListItem, SharePolicy } from '@/lib/types';

export const ACCESS_CONTROL_VIEWS: AccessControlView[] = ['overview', 'organizations', 'users', 'roles', 'resources', 'audit'];

export const DATA_SCOPE_OPTIONS: DataScope[] = [
    'ALL',
    'ORG_AND_CHILDREN',
    'ORG_ONLY',
    'CUSTOM_ORGS',
    'SELF',
];

export const SHARE_POLICY_OPTIONS: SharePolicy[] = [
    'PRIVATE',
    'SHARED_READONLY',
    'SHARED_COPYABLE',
    'PUBLIC_IN_GROUP',
];

export const RESOURCE_DOMAINS: ResourceDomain[] = ['mail', 'skill', 'model'];

export const CONFIG_PERMISSION_KEYS = [
    'recruitment-mail-config-manage',
    'recruitment-mail-sender-manage',
    'recruitment-skill-manage',
    'recruitment-llm-config-manage',
    'resource-sharing-manage',
];

export const RESOURCE_PLACEHOLDER_ITEMS: ResourceListItem[] = [];
