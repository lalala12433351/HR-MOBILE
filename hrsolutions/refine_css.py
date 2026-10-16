import os
import re

base_dir = r"d:\Code\internship\solutions\hrsolutions\src\components"

files_to_process = [
    "common/CommandPalette.tsx",
    "common/WorkspaceSocialHub.tsx",
    "common/EmployeeTimePanel.tsx",
    "common/AddOfficeModal.tsx",
    "common/ImpersonationBanner.tsx",
    "common/NotificationToastContainer.tsx",
    "ai/AIAssistantModal.tsx",
    "auth/AuthOnboardingView.tsx",
    "auth/CognitoPasswordPolicyGuide.tsx",
    "auth/StudentLoginView.tsx",
    "skeletons/DashboardPageSkeleton.tsx",
    "skeletons/AdminPageSkeleton.tsx",
    "skeletons/ListFeedPageSkeleton.tsx",
    "skeletons/TabsTablePageSkeleton.tsx",
    "layout/MobileBottomBar.tsx",
    "modules/AnalyticsModule.tsx",
    "modules/AutomationModule.tsx",
    "modules/ClientPortalModule.tsx",
    "modules/DocumentsModule.tsx",
    "modules/ProductivityModule.tsx"
]

patterns = [
    (r'\bborder-slate-200\b', 'border-[var(--border-color)]'),
    (r'\bborder-slate-100\b', 'border-[var(--border-color)]'),
    (r'\bborder-slate-300\b', 'border-[var(--border-strong)]'),
    (r'\bdivide-slate-100\b', 'divide-[var(--border-color)]'),
    (r'\bdivide-slate-200\b', 'divide-[var(--border-color)]'),
    (r'\bbg-white\b', 'bg-[var(--bg-surface)]'),
    (r'\bbg-slate-50\b', 'bg-[var(--bg-surface-subtle)]'),
    (r'\bbg-slate-100\b', 'bg-[var(--bg-surface-subtle)]'),
    (r'\bhover:bg-slate-50\b', 'hover:bg-[var(--bg-surface-subtle)]'),
    (r'\bhover:bg-slate-100\b', 'hover:bg-[var(--bg-surface-hover)]'),
    (r'\bhover:bg-slate-200\b', 'hover:bg-[var(--bg-surface-hover)]'),
    (r'\btext-slate-900\b', 'text-[var(--text-primary)]'),
    (r'\btext-slate-800\b', 'text-[var(--text-primary)]'),
    (r'\btext-\[\#0f172a\]\b', 'text-[var(--text-primary)]'),
    (r'\btext-slate-700\b', 'text-[var(--text-secondary)]'),
    (r'\btext-slate-600\b', 'text-[var(--text-secondary)]'),
    (r'\btext-slate-500\b', 'text-[var(--text-muted)]'),
    (r'\btext-slate-400\b', 'text-[var(--text-muted)]'),
    (r'\bshadow-xl\b', 'shadow-lg'),
    (r'\bshadow-xs\s*', ''),
    (r'\brounded-2xl\b', 'TEMP_R_XL'),
    (r'\brounded-xl\b', 'rounded-lg'),
    (r'TEMP_R_XL', 'rounded-xl'),
    (r'(?<!-)\btransition(?!-)', 'transition-colors duration-150'),
    (r'\bfocus:ring-blue-500\b', 'focus:ring-[var(--primary-blue)]')
]

for file in files_to_process:
    filepath = os.path.join(base_dir, file)
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            
        new_content = content
        for pattern, replacement in patterns:
            new_content = re.sub(pattern, replacement, new_content)
            
        # Remove dark: overrides
        new_content = re.sub(r'dark:bg-[a-z0-9\-]+\s?', '', new_content)
        new_content = re.sub(r'dark:text-[a-z0-9\-]+\s?', '', new_content)
        new_content = re.sub(r'dark:border-[a-z0-9\-]+\s?', '', new_content)
        new_content = re.sub(r'dark:hover:bg-[a-z0-9\-]+\s?', '', new_content)
        new_content = re.sub(r'dark:divide-[a-z0-9\-]+\s?', '', new_content)
        new_content = re.sub(r'dark:ring-[a-z0-9\-]+\s?', '', new_content)
        
        # fix multiple spaces from removed classes, inside class strings
        new_content = re.sub(r'(class(?:Name)?="[^"]*?)  +([^"]*")', r'\1 \2', new_content)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
            
        print(f"Processed {file}")
    else:
        print(f"File not found: {file}")
