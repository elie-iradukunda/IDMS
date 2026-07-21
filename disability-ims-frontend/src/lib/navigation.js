import {
  Users, FilePlus2, HandHeart, ClipboardList, Megaphone, UserRound, Activity,
  Inbox, Search, LayoutDashboard, UserCog, ShieldCheck,
} from 'lucide-react';

// Per-role header identity (bilingual).
export const roleMeta = {
  OFFICER:     { en: "Local Officer", rw: "Umukozi w'Akarere", subEn: 'Kamonyi District — registry & support coordination', subRw: "Akarere ka Kamonyi — registry n'ubufasha" },
  BENEFICIARY: { en: 'Beneficiary / Guardian', rw: 'Uwunguka / Umurezi', subEn: 'Your verified record and support status', subRw: 'Umwirondoro wawe wemejwe' },
  PROVIDER:    { en: 'Support Provider', rw: 'Utanga Ubufasha', subEn: 'Match recorded needs and offer targeted support', subRw: 'Huza ubukene utange ubufasha' },
  ADMIN:       { en: 'System Administrator', rw: 'Umuyobozi wa Sisitemu', subEn: 'Coverage, users, announcements and audit', subRw: 'Coverage, abakoresha, amatangazo na audit' },
};

// Sidebar navigation, keyed by backend role. Labels are bilingual; each
// entry maps to an existing route/page.
export const navByRole = {
  OFFICER: [
    { path: '/officer/registry',    en: 'Registry',            rw: 'Registry',   icon: Users },
    { path: '/officer/register',    en: 'Register beneficiary', rw: 'Kwandika',   icon: FilePlus2 },
    { path: '/officer/requests',    en: 'Support requests',    rw: 'Ibyifuzo',    icon: HandHeart },
    { path: '/officer/corrections', en: 'Corrections',         rw: 'Gukosora',    icon: ClipboardList },
    { path: '/officer/publish',     en: 'Publish opportunity', rw: 'Tangaza',     icon: Megaphone },
  ],
  BENEFICIARY: [
    { path: '/beneficiary/profile',       en: 'My profile',     rw: 'Umwirondoro', icon: UserRound },
    { path: '/beneficiary/support',       en: 'Support status', rw: 'Ubufasha',    icon: Activity },
    { path: '/beneficiary/opportunities', en: 'Opportunities',  rw: 'Amahirwe',    icon: Megaphone },
    { path: '/beneficiary/messages',      en: 'Messages',       rw: 'Ubutumwa',    icon: Inbox },
  ],
  PROVIDER: [
    { path: '/provider/search',  en: 'Find by need',        rw: 'Shakisha',     icon: Search },
    { path: '/provider/offers',  en: 'My offers',           rw: 'Ibyo natanze', icon: ClipboardList },
    { path: '/provider/publish', en: 'Publish opportunity', rw: 'Tangaza',      icon: Megaphone },
  ],
  ADMIN: [
    { path: '/admin/reports',      en: 'Reports & analytics',    rw: 'Raporo',       icon: LayoutDashboard },
    { path: '/admin/users',        en: 'Users & roles',          rw: 'Abakoresha',   icon: UserCog },
    { path: '/admin/announcement', en: 'National announcement',  rw: 'Itangazo',     icon: Megaphone },
    { path: '/admin/audit',        en: 'Audit log',              rw: 'Audit log',    icon: Activity },
  ],
};
