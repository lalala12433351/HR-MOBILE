/**
 * Country → State/Province → City cascade for employee address onboarding.
 * India is fully covered (all states/UTs + major cities). Other countries fall back to text inputs.
 */

export type LocationCityMap = Record<string, string[]>;
export type LocationCountryMap = Record<string, LocationCityMap>;

const INDIA_STATES: LocationCityMap = {
  'Andaman and Nicobar Islands': ['Port Blair', 'Diglipur', 'Mayabunder', 'Car Nicobar'],
  'Andhra Pradesh': [
    'Visakhapatnam',
    'Vijayawada',
    'Guntur',
    'Nellore',
    'Tirupati',
    'Kakinada',
    'Rajahmundry',
    'Anantapur',
    'Kadapa',
    'Kurnool',
  ],
  'Arunachal Pradesh': ['Itanagar', 'Naharlagun', 'Pasighat', 'Tawang', 'Ziro'],
  Assam: ['Guwahati', 'Silchar', 'Dibrugarh', 'Jorhat', 'Tezpur', 'Nagaon', 'Tinsukia'],
  Bihar: ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Purnia', 'Darbhanga', 'Bihar Sharif'],
  Chandigarh: ['Chandigarh'],
  Chhattisgarh: ['Raipur', 'Bhilai', 'Bilaspur', 'Korba', 'Durg', 'Rajnandgaon'],
  'Dadra and Nagar Haveli and Daman and Diu': ['Daman', 'Diu', 'Silvassa'],
  Delhi: [
    'New Delhi',
    'Central Delhi',
    'East Delhi',
    'North Delhi',
    'North East Delhi',
    'North West Delhi',
    'Shahdara',
    'South Delhi',
    'South East Delhi',
    'South West Delhi',
    'West Delhi',
  ],
  Goa: ['Panaji', 'Margao', 'Vasco da Gama', 'Mapusa', 'Ponda'],
  Gujarat: [
    'Ahmedabad',
    'Surat',
    'Vadodara',
    'Rajkot',
    'Bhavnagar',
    'Jamnagar',
    'Gandhinagar',
    'Junagadh',
    'Anand',
    'Morbi',
  ],
  Haryana: [
    'Gurugram',
    'Faridabad',
    'Panipat',
    'Ambala',
    'Karnal',
    'Hisar',
    'Rohtak',
    'Sonipat',
    'Panchkula',
    'Yamunanagar',
  ],
  'Himachal Pradesh': ['Shimla', 'Dharamshala', 'Mandi', 'Solan', 'Kullu', 'Manali', 'Hamirpur'],
  'Jammu and Kashmir': ['Srinagar', 'Jammu', 'Anantnag', 'Baramulla', 'Udhampur', 'Kathua'],
  Jharkhand: ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro', 'Hazaribagh', 'Deoghar'],
  Karnataka: [
    'Bengaluru',
    'Mysuru',
    'Mangaluru',
    'Hubballi',
    'Belagavi',
    'Davangere',
    'Ballari',
    'Shivamogga',
    'Tumakuru',
    'Kalaburagi',
    'Udupi',
  ],
  Kerala: [
    'Thiruvananthapuram',
    'Kochi',
    'Kozhikode',
    'Thrissur',
    'Kollam',
    'Kannur',
    'Alappuzha',
    'Palakkad',
    'Kottayam',
  ],
  Ladakh: ['Leh', 'Kargil'],
  Lakshadweep: ['Kavaratti', 'Agatti', 'Minicoy'],
  'Madhya Pradesh': [
    'Bhopal',
    'Indore',
    'Gwalior',
    'Jabalpur',
    'Ujjain',
    'Sagar',
    'Rewa',
    'Satna',
    'Ratlam',
  ],
  Maharashtra: [
    'Mumbai',
    'Pune',
    'Nagpur',
    'Thane',
    'Nashik',
    'Aurangabad',
    'Solapur',
    'Kolhapur',
    'Amravati',
    'Navi Mumbai',
    'Vasai-Virar',
  ],
  Manipur: ['Imphal', 'Thoubal', 'Bishnupur', 'Churachandpur'],
  Meghalaya: ['Shillong', 'Tura', 'Jowai', 'Nongpoh'],
  Mizoram: ['Aizawl', 'Lunglei', 'Champhai', 'Serchhip'],
  Nagaland: ['Kohima', 'Dimapur', 'Mokokchung', 'Tuensang'],
  Odisha: ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Berhampur', 'Sambalpur', 'Puri', 'Balasore'],
  Puducherry: ['Puducherry', 'Karaikal', 'Mahe', 'Yanam'],
  Punjab: [
    'Ludhiana',
    'Amritsar',
    'Jalandhar',
    'Patiala',
    'Bathinda',
    'Mohali',
    'Pathankot',
    'Hoshiarpur',
  ],
  Rajasthan: [
    'Jaipur',
    'Jodhpur',
    'Udaipur',
    'Kota',
    'Ajmer',
    'Bikaner',
    'Alwar',
    'Bhilwara',
    'Sikar',
  ],
  Sikkim: ['Gangtok', 'Namchi', 'Gyalshing', 'Mangan'],
  'Tamil Nadu': [
    'Chennai',
    'Coimbatore',
    'Madurai',
    'Tiruchirappalli',
    'Salem',
    'Tirunelveli',
    'Erode',
    'Vellore',
    'Thoothukudi',
    'Thanjavur',
  ],
  Telangana: [
    'Hyderabad',
    'Warangal',
    'Nizamabad',
    'Karimnagar',
    'Khammam',
    'Ramagundam',
    'Mahbubnagar',
  ],
  Tripura: ['Agartala', 'Udaipur', 'Dharmanagar', 'Kailashahar'],
  'Uttar Pradesh': [
    'Lucknow',
    'Kanpur',
    'Ghaziabad',
    'Agra',
    'Varanasi',
    'Meerut',
    'Prayagraj',
    'Noida',
    'Bareilly',
    'Aligarh',
    'Moradabad',
    'Gorakhpur',
  ],
  Uttarakhand: ['Dehradun', 'Haridwar', 'Roorkee', 'Haldwani', 'Rishikesh', 'Nainital'],
  'West Bengal': [
    'Kolkata',
    'Howrah',
    'Durgapur',
    'Asansol',
    'Siliguri',
    'Kharagpur',
    'Bardhaman',
    'Malda',
  ],
};

export const LOCATION_DATA: LocationCountryMap = {
  India: INDIA_STATES,
};

export function hasLocationSelects(country: string): boolean {
  return Boolean(country && LOCATION_DATA[country]);
}

export function getStatesForCountry(country: string): string[] {
  const states = LOCATION_DATA[country];
  if (!states) return [];
  return Object.keys(states).sort((a, b) => a.localeCompare(b));
}

export function getCitiesForState(country: string, state: string): string[] {
  const cities = LOCATION_DATA[country]?.[state];
  if (!cities) return [];
  return [...cities].sort((a, b) => a.localeCompare(b));
}
