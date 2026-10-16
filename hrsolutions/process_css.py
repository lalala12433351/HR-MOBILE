import re
import os
import sys

def process_file(filepath):
    print(f"Processing {filepath}")
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content

    # Borders
    content = re.sub(r'\bborder-slate-200(?![/\w])', 'border-[var(--border-color)]', content)
    content = re.sub(r'\bborder-slate-200/(\d+)', 'border-[var(--border-color)]', content)
    content = re.sub(r'\bborder-slate-100(?![/\w])', 'border-[var(--border-color)]', content)
    content = re.sub(r'\bborder-slate-300(?![/\w])', 'border-[var(--border-strong)]', content)
    content = re.sub(r'\bdivide-slate-100(?![/\w])', 'divide-[var(--border-color)]', content)
    content = re.sub(r'\bdivide-slate-200(?![/\w])', 'divide-[var(--border-color)]', content)

    # Backgrounds
    # bg-white -> bg-[var(--bg-surface)] but NOT in badges
    content = re.sub(r'(?<!text-)\bbg-white\b(?!\s+(?:text-white|rounded-full))', 'bg-[var(--bg-surface)]', content)
    content = re.sub(r'\bbg-slate-50\b', 'bg-[var(--bg-surface-subtle)]', content)
    # bg-slate-100 NOT in badges (naive approach: avoid if next to text-slate-600/700 maybe? The prompt says 'NOT for status badges')
    # Actually, let's just do an aggressive replace except for AttendanceStatusPill which we skipped
    if 'StatusPill' not in filepath:
        content = re.sub(r'\bbg-slate-100\b', 'bg-[var(--bg-surface-subtle)]', content)
    
    content = re.sub(r'\bhover:bg-slate-50\b', 'hover:bg-[var(--bg-surface-subtle)]', content)
    content = re.sub(r'\bhover:bg-slate-100\b', 'hover:bg-[var(--bg-surface-hover)]', content)
    content = re.sub(r'\bhover:bg-slate-200\b', 'hover:bg-[var(--bg-surface-hover)]', content)

    # Text colors
    content = re.sub(r'\btext-slate-900\b', 'text-[var(--text-primary)]', content)
    content = re.sub(r'\btext-slate-800\b', 'text-[var(--text-primary)]', content)
    content = re.sub(r'\btext-\[\#0f172a\]\b', 'text-[var(--text-primary)]', content)
    content = re.sub(r'\btext-slate-700\b', 'text-[var(--text-secondary)]', content)
    content = re.sub(r'\btext-slate-600\b', 'text-[var(--text-secondary)]', content)
    content = re.sub(r'\btext-slate-500\b', 'text-[var(--text-muted)]', content)
    content = re.sub(r'\btext-slate-400\b', 'text-[var(--text-muted)]', content)

    # Shadows
    content = re.sub(r'\bshadow-xl\b', 'shadow-lg', content)
    # Remove shadow-xs from inline controls - wait, let's skip this for automation since we can't easily distinguish controls vs cards.
    # The prompt says focus on impactful patterns.

    # Border Radius
    content = re.sub(r'\brounded-2xl\b', 'rounded-xl', content)
    # rounded-xl on small buttons/controls - hard to regex accurately, skip or change all?
    # prompt: "focus on MOST IMPACTFUL patterns: borders, backgrounds, shadows, dropdown/modal containers"

    # Focus states
    content = re.sub(r'\bfocus:ring-blue-500\b', 'focus:ring-[var(--primary-blue)]', content)
    content = re.sub(r'\bfocus:border-blue-500\b', 'focus:border-[var(--primary-blue)]', content)

    # Blue accent
    content = re.sub(r'\bbg-blue-50\b', 'bg-[color-mix(in_srgb,var(--primary-blue)_8%,transparent)]', content)

    # Remove dark prefixes for the handled vars
    content = re.sub(r'dark:border-\[\#[0-9a-fA-F]+\]', '', content)
    content = re.sub(r'dark:bg-\[\#[0-9a-fA-F]+\]', '', content)

    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")

files = [
    r"D:\Code\internship\solutions\hrsolutions\src\components\modules\attendance\AttendanceOverviewChart.tsx",
    r"D:\Code\internship\solutions\hrsolutions\src\components\modules\attendance\AttendanceReportsModal.tsx",
    r"D:\Code\internship\solutions\hrsolutions\src\components\modules\attendance\HolidayCalendarView.tsx",
    r"D:\Code\internship\solutions\hrsolutions\src\components\modules\AttendanceReportsSection.tsx",
    r"D:\Code\internship\solutions\hrsolutions\src\components\modules\AttendanceSettingsView.tsx",
    r"D:\Code\internship\solutions\hrsolutions\src\components\modules\GoogleCalendarTimesheet.tsx",
    r"D:\Code\internship\solutions\hrsolutions\src\components\modules\KekaAttendanceModule.tsx",
    r"D:\Code\internship\solutions\hrsolutions\src\components\modules\TimesheetsModule.tsx"
]

for f in files:
    if os.path.exists(f):
        process_file(f)
