import { Holiday, HolidayTemplate } from '@/types';

export const holidayTemplates: HolidayTemplate[] = [
  {
    id: 'indian_national_festivals',
    name: 'Indian National & Festivals',
    holidaysByYear: {
      2025: [
        { name: 'Makara Sankranti / Pongal', date: '2025-01-14', dayOfWeek: 'Tuesday' },
        { name: 'Republic Day', date: '2025-01-26', dayOfWeek: 'Sunday' },
        { name: 'Maha Shivratri', date: '2025-02-26', dayOfWeek: 'Wednesday' },
        { name: 'Holi', date: '2025-03-14', dayOfWeek: 'Friday' },
        { name: 'Ugadi / Gudi Padwa', date: '2025-03-30', dayOfWeek: 'Sunday' },
        { name: 'Ramzan / Eid-ul-Fitr', date: '2025-03-31', dayOfWeek: 'Monday' },
        { name: 'May Day / Labor Day', date: '2025-05-01', dayOfWeek: 'Thursday' },
        { name: 'Bakrid / Eid al-Adha', date: '2025-06-07', dayOfWeek: 'Saturday' },
        { name: 'Independence Day', date: '2025-08-15', dayOfWeek: 'Friday' },
        { name: 'Gandhi Jayanti', date: '2025-10-02', dayOfWeek: 'Thursday' },
        { name: 'Dussehra / Vijayadashami', date: '2025-10-02', dayOfWeek: 'Thursday' },
        { name: 'Diwali / Deepavali', date: '2025-10-20', dayOfWeek: 'Monday' },
        { name: 'Christmas Day', date: '2025-12-25', dayOfWeek: 'Thursday' },
      ],
      2026: [
        { name: 'Makara Sankranti Festival', date: '2026-01-15', dayOfWeek: 'Thursday' },
        { name: 'Republic Day', date: '2026-01-26', dayOfWeek: 'Monday' },
        { name: 'Maha Shivratri', date: '2026-02-16', dayOfWeek: 'Monday' },
        { name: 'Holi', date: '2026-03-04', dayOfWeek: 'Wednesday' },
        { name: 'Ugadi', date: '2026-03-19', dayOfWeek: 'Thursday' },
        { name: 'Ramzan', date: '2026-03-21', dayOfWeek: 'Saturday' },
        { name: 'May Day', date: '2026-05-01', dayOfWeek: 'Friday' },
        { name: 'Bakrid', date: '2026-05-28', dayOfWeek: 'Thursday' },
        { name: 'Independence Day', date: '2026-08-15', dayOfWeek: 'Saturday' },
        { name: 'Gandhi Jayanti', date: '2026-10-02', dayOfWeek: 'Friday' },
        { name: 'Dussehra', date: '2026-10-20', dayOfWeek: 'Tuesday' },
        { name: 'Diwali', date: '2026-11-08', dayOfWeek: 'Sunday' },
        { name: 'Christmas Day', date: '2026-12-25', dayOfWeek: 'Friday' },
      ],
      2027: [
        { name: 'Makara Sankranti Festival', date: '2027-01-15', dayOfWeek: 'Friday' },
        { name: 'Republic Day', date: '2027-01-26', dayOfWeek: 'Tuesday' },
        { name: 'Maha Shivratri', date: '2027-03-07', dayOfWeek: 'Sunday' },
        { name: 'Holi', date: '2027-03-23', dayOfWeek: 'Tuesday' },
        { name: 'Ugadi', date: '2027-04-07', dayOfWeek: 'Wednesday' },
        { name: 'May Day', date: '2027-05-01', dayOfWeek: 'Saturday' },
        { name: 'Independence Day', date: '2027-08-15', dayOfWeek: 'Sunday' },
        { name: 'Gandhi Jayanti', date: '2027-10-02', dayOfWeek: 'Saturday' },
        { name: 'Dussehra', date: '2027-10-10', dayOfWeek: 'Sunday' },
        { name: 'Diwali', date: '2027-10-29', dayOfWeek: 'Friday' },
        { name: 'Christmas Day', date: '2027-12-25', dayOfWeek: 'Saturday' },
      ],
    },
  },
  {
    id: 'corporate_standard',
    name: 'Corporate Standard (10 Days)',
    holidaysByYear: {
      2025: [
        { name: 'New Year Day', date: '2025-01-01', dayOfWeek: 'Wednesday' },
        { name: 'Republic Day', date: '2025-01-26', dayOfWeek: 'Sunday' },
        { name: 'Holi', date: '2025-03-14', dayOfWeek: 'Friday' },
        { name: 'May Day', date: '2025-05-01', dayOfWeek: 'Thursday' },
        { name: 'Independence Day', date: '2025-08-15', dayOfWeek: 'Friday' },
        { name: 'Gandhi Jayanti', date: '2025-10-02', dayOfWeek: 'Thursday' },
        { name: 'Dussehra', date: '2025-10-02', dayOfWeek: 'Thursday' },
        { name: 'Diwali', date: '2025-10-20', dayOfWeek: 'Monday' },
        { name: 'Christmas', date: '2025-12-25', dayOfWeek: 'Thursday' },
      ],
      2026: [
        { name: 'New Year Day', date: '2026-01-01', dayOfWeek: 'Thursday' },
        { name: 'Republic Day', date: '2026-01-26', dayOfWeek: 'Monday' },
        { name: 'Holi', date: '2026-03-04', dayOfWeek: 'Wednesday' },
        { name: 'May Day', date: '2026-05-01', dayOfWeek: 'Friday' },
        { name: 'Independence Day', date: '2026-08-15', dayOfWeek: 'Saturday' },
        { name: 'Gandhi Jayanti', date: '2026-10-02', dayOfWeek: 'Friday' },
        { name: 'Dussehra', date: '2026-10-20', dayOfWeek: 'Tuesday' },
        { name: 'Diwali', date: '2026-11-08', dayOfWeek: 'Sunday' },
        { name: 'Christmas', date: '2026-12-25', dayOfWeek: 'Friday' },
      ],
      2027: [
        { name: 'New Year Day', date: '2027-01-01', dayOfWeek: 'Friday' },
        { name: 'Republic Day', date: '2027-01-26', dayOfWeek: 'Tuesday' },
        { name: 'Holi', date: '2027-03-23', dayOfWeek: 'Tuesday' },
        { name: 'May Day', date: '2027-05-01', dayOfWeek: 'Saturday' },
        { name: 'Independence Day', date: '2027-08-15', dayOfWeek: 'Sunday' },
        { name: 'Gandhi Jayanti', date: '2027-10-02', dayOfWeek: 'Saturday' },
        { name: 'Diwali', date: '2027-10-29', dayOfWeek: 'Friday' },
        { name: 'Christmas', date: '2027-12-25', dayOfWeek: 'Saturday' },
      ],
    },
  },
  {
    id: 'karnataka_it_hub',
    name: 'Karnataka IT Corridor (Bangalore)',
    holidaysByYear: {
      2025: [
        { name: 'Makara Sankranti', date: '2025-01-14', dayOfWeek: 'Tuesday' },
        { name: 'Republic Day', date: '2025-01-26', dayOfWeek: 'Sunday' },
        { name: 'Ugadi', date: '2025-03-30', dayOfWeek: 'Sunday' },
        { name: 'May Day', date: '2025-05-01', dayOfWeek: 'Thursday' },
        { name: 'Independence Day', date: '2025-08-15', dayOfWeek: 'Friday' },
        { name: 'Gandhi Jayanti', date: '2025-10-02', dayOfWeek: 'Thursday' },
        { name: 'Kannada Rajyotsava', date: '2025-11-01', dayOfWeek: 'Saturday' },
        { name: 'Diwali', date: '2025-10-20', dayOfWeek: 'Monday' },
        { name: 'Christmas', date: '2025-12-25', dayOfWeek: 'Thursday' },
      ],
      2026: [
        { name: 'Makara Sankranti', date: '2026-01-15', dayOfWeek: 'Thursday' },
        { name: 'Republic Day', date: '2026-01-26', dayOfWeek: 'Monday' },
        { name: 'Ugadi', date: '2026-03-19', dayOfWeek: 'Thursday' },
        { name: 'May Day', date: '2026-05-01', dayOfWeek: 'Friday' },
        { name: 'Independence Day', date: '2026-08-15', dayOfWeek: 'Saturday' },
        { name: 'Gandhi Jayanti', date: '2026-10-02', dayOfWeek: 'Friday' },
        { name: 'Kannada Rajyotsava', date: '2026-11-01', dayOfWeek: 'Sunday' },
        { name: 'Diwali', date: '2026-11-08', dayOfWeek: 'Sunday' },
        { name: 'Christmas', date: '2026-12-25', dayOfWeek: 'Friday' },
      ],
      2027: [
        { name: 'Makara Sankranti', date: '2027-01-15', dayOfWeek: 'Friday' },
        { name: 'Republic Day', date: '2027-01-26', dayOfWeek: 'Tuesday' },
        { name: 'Ugadi', date: '2027-04-07', dayOfWeek: 'Wednesday' },
        { name: 'May Day', date: '2027-05-01', dayOfWeek: 'Saturday' },
        { name: 'Independence Day', date: '2027-08-15', dayOfWeek: 'Sunday' },
        { name: 'Gandhi Jayanti', date: '2027-10-02', dayOfWeek: 'Saturday' },
        { name: 'Kannada Rajyotsava', date: '2027-11-01', dayOfWeek: 'Monday' },
        { name: 'Diwali', date: '2027-10-29', dayOfWeek: 'Friday' },
        { name: 'Christmas', date: '2027-12-25', dayOfWeek: 'Saturday' },
      ],
    },
  },
  {
    id: 'global_us',
    name: 'Global / US Corporate',
    holidaysByYear: {
      2025: [
        { name: 'New Year Day', date: '2025-01-01', dayOfWeek: 'Wednesday' },
        { name: 'MLK Jr. Day', date: '2025-01-20', dayOfWeek: 'Monday' },
        { name: 'Memorial Day', date: '2025-05-26', dayOfWeek: 'Monday' },
        { name: 'Independence Day', date: '2025-07-04', dayOfWeek: 'Friday' },
        { name: 'Labor Day', date: '2025-09-01', dayOfWeek: 'Monday' },
        { name: 'Thanksgiving Day', date: '2025-11-27', dayOfWeek: 'Thursday' },
        { name: 'Christmas Day', date: '2025-12-25', dayOfWeek: 'Thursday' },
      ],
      2026: [
        { name: 'New Year Day', date: '2026-01-01', dayOfWeek: 'Thursday' },
        { name: 'MLK Jr. Day', date: '2026-01-19', dayOfWeek: 'Monday' },
        { name: 'Memorial Day', date: '2026-05-25', dayOfWeek: 'Monday' },
        { name: 'Independence Day', date: '2026-07-04', dayOfWeek: 'Saturday' },
        { name: 'Labor Day', date: '2026-09-07', dayOfWeek: 'Monday' },
        { name: 'Thanksgiving Day', date: '2026-11-26', dayOfWeek: 'Thursday' },
        { name: 'Christmas Day', date: '2026-12-25', dayOfWeek: 'Friday' },
      ],
      2027: [
        { name: 'New Year Day', date: '2027-01-01', dayOfWeek: 'Friday' },
        { name: 'MLK Jr. Day', date: '2027-01-18', dayOfWeek: 'Monday' },
        { name: 'Memorial Day', date: '2027-05-31', dayOfWeek: 'Monday' },
        { name: 'Independence Day', date: '2027-07-04', dayOfWeek: 'Sunday' },
        { name: 'Labor Day', date: '2027-09-06', dayOfWeek: 'Monday' },
        { name: 'Thanksgiving Day', date: '2027-11-25', dayOfWeek: 'Thursday' },
        { name: 'Christmas Day', date: '2027-12-25', dayOfWeek: 'Saturday' },
      ],
    },
  },
];

export const generateInitialHolidays = (): Holiday[] => {
  const defaultTemplate = holidayTemplates[0];
  const list: Holiday[] = [];

  [2025, 2026, 2027].forEach((yr) => {
    const items = defaultTemplate.holidaysByYear[yr] || [];
    items.forEach((h, idx) => {
      list.push({
        id: `hol_${yr}_${idx + 1}`,
        name: h.name,
        date: h.date,
        year: yr,
        dayOfWeek: h.dayOfWeek,
        isApproved: true,
      });
    });
  });

  return list;
};
