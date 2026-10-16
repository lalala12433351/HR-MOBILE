const fs = require('fs');
const path = require('path');

const dir = 'd:/Code/internship/solutions/hrsolutions/src/components/modules';
const files = [
  'HRMSModule.tsx',
  'hrms/AddEmployeeModal.tsx',
  'hrms/EmployeeTableTab.tsx',
  'hrms/EmployeeProfileCardModal.tsx',
  'hrms/StaffCardsTab.tsx',
  'EmployeeDetailView.tsx',
  'EmployeeSettingsView.tsx',
  'EmployeeOnboardingView.tsx',
  'EmployeeSetupWizard.tsx'
];

const replacements = [
  { regex: /\\bborder-slate-200\\b/g, replacement: 'border-[var(--border-color)]' },
  { regex: /\\bborder-slate-100\\b/g, replacement: 'border-[var(--border-color)]' },
  { regex: /\\bborder-slate-300\\b/g, replacement: 'border-[var(--border-strong)]' },
  { regex: /\\bdivide-slate-100\\b/g, replacement: 'divide-[var(--border-color)]' },
  { regex: /\\bdivide-slate-200\\b/g, replacement: 'divide-[var(--border-color)]' },
  { regex: /\\bbg-white\\b(?![^<]*?(?:text-white|badge|bg-green|bg-emerald|bg-amber|bg-rose))/gi, replacement: 'bg-[var(--bg-surface)]' },
  { regex: /\\bbg-slate-50\\b/g, replacement: 'bg-[var(--bg-surface-subtle)]' },
  { regex: /\\bbg-slate-100\\b(?![^<]*?badge)/gi, replacement: 'bg-[var(--bg-surface-subtle)]' },
  { regex: /\\bhover:bg-slate-50\\b/g, replacement: 'hover:bg-[var(--bg-surface-subtle)]' },
  { regex: /\\bhover:bg-slate-100\\b/g, replacement: 'hover:bg-[var(--bg-surface-hover)]' },
  { regex: /\\bhover:bg-slate-200\\b/g, replacement: 'hover:bg-[var(--bg-surface-hover)]' },
  { regex: /\\btext-slate-900\\b|\\btext-slate-800\\b|\\btext-\\[#0f172a\\]\\b/g, replacement: 'text-[var(--text-primary)]' },
  { regex: /\\btext-slate-700\\b|\\btext-slate-600\\b/g, replacement: 'text-[var(--text-secondary)]' },
  { regex: /\\btext-slate-500\\b|\\btext-slate-400\\b/g, replacement: 'text-[var(--text-muted)]' },
  { regex: /\\bshadow-xl\\b/g, replacement: 'shadow-lg' },
  { regex: /\\bshadow-xs\\b/g, replacement: '' },
  { regex: /\\brounded-2xl\\b/g, replacement: 'rounded-xl' },
  { regex: /\\brounded-xl\\b(?=\\s.*?class.*?button|.*?px-.*?py-)/gi, replacement: 'rounded-lg' }, 
  { regex: /\\b(?<!-)transition\\b(?!-)/g, replacement: 'transition-colors duration-150' },
  { regex: /\\bfocus:ring-blue-500\\b/g, replacement: 'focus:ring-[var(--primary-blue)]' },
  { regex: /\\bfocus:border-blue-500\\b/g, replacement: 'focus:border-[var(--primary-blue)]' },
  { regex: /\\bdark:border-\\[#282830\\]\\b/g, replacement: '' },
  { regex: /\\bdark:bg-\\[#161619\\]\\b/g, replacement: '' }
];

files.forEach(file => {
  const fullPath = path.join(dir, file);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    let original = content;
    replacements.forEach(({regex, replacement}) => {
      content = content.replace(regex, replacement);
    });
    content = content.replace(/\\s{2,}/g, ' '); // Clean up double spaces from empty replacements
    if (original !== content) {
      fs.writeFileSync(fullPath, content);
      console.log('Updated ' + file);
    } else {
      console.log('No changes in ' + file);
    }
  } else {
    console.log('Not found: ' + file);
  }
});
