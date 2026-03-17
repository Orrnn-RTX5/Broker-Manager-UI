import { useState, useMemo } from 'react';
import { User, ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle } from 'lucide-react';
import useDataSource from '../../../hooks/useDataSource';
import { getClients } from '../../../services/api';
import { CLIENTS_FALLBACK } from '../../../data/clients';

const RAW_DATA = [
  { id: 1000, name: 'Chifamba dilan', city: 'Harare', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'chifamba@gmail.com', phone: '+263888765432', country: 'Zimbabwe' },
  { id: 1001, name: 'Rup Kumar Panday Chhetri', city: 'Dubai', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'rupkumar@gmail.com', phone: '+971503345678', country: 'United Arab Emirates' },
  { id: 1002, name: 'YoForex Platform', city: 'Mumbai', type: 'Individual', status: 'Active', lead: 'Undefined', email: 'yoforex@yoforextech.com', phone: '+919876543210', country: 'India' },
  { id: 1003, name: 'shri krishna', city: 'Jaipur', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'shrikrishna@gmail.com', phone: '+919413321223', country: 'India' },
  { id: 1004, name: 'YoForex Investor\'s', city: 'New Delhi', type: 'Individual', status: 'Active', lead: 'Undefined', email: 'investors@yoforex.com', phone: '+911234567890', country: 'India' },
  { id: 1005, name: 'Arijeet Nayak', city: 'Bhubaneswar', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'arjeet1968@gmail.com', phone: '+919437856117', country: 'India' },
  { id: 1006, name: 'Chintan', city: 'Dubai', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'chintan@gmail.com', phone: '+971586563117', country: 'United Arab Emirates' },
  { id: 1007, name: 'AUNALI CHAUDHARI', city: 'Surat', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'aunali@gmail.com', phone: '+919879222608', country: 'India' },
  { id: 1034, name: 'Gurtej Singh', city: 'Ludhiana', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'gurtejsingh28102005@gmail.com', phone: '+919501921823', country: 'India' },
  { id: 1035, name: 'Raymond Felton', city: 'Virginia Beach', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'rdf2753@gmail.com', phone: '+17577743495', country: 'United States' },
  { id: 1036, name: 'Venkedesh Trader', city: 'Coimbatore', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'nkoranuth120499@gmail.com', phone: '+919360041027', country: 'India' },
  { id: 1037, name: 'Kelson Ge Sellstrom', city: 'Chicago', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'kelsontrades@gmail.com', phone: '+447568750799', country: 'United Kingdom' },
  { id: 1038, name: 'Am Sa', city: 'Kuwait City', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'ameen2011@live.com', phone: '+96504302299', country: 'Kuwait' },
  { id: 1039, name: 'Sanjay Vaishnav', city: 'Jaipur', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'sanjayvashnav@gmail.com', phone: '+919413321223', country: 'India' },
  { id: 1040, name: 'Flex Fx Danny', city: 'Durban', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'luckyngobeni164@gmail.com', phone: '+12345678910', country: 'South Africa' },
  { id: 1041, name: 'Isreal Onuta Monday', city: 'Abuja', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'isrealjecob334@gmail.com', phone: '+2348051289282', country: 'Nigeria' },
  { id: 1042, name: 'Arijit Nayak', city: 'Dubai', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'ranjan.nayak1968@gmail.com', phone: '+971586636117', country: 'United Arab Emirates' },
  { id: 1043, name: 'Flex Fx Goat Forex', city: 'Durban', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'xonaphingobon@gmail.com', phone: '+12345678910', country: 'South Africa' },
  { id: 1044, name: 'Kishorekumar Mani', city: 'Dubai', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'kishorefxapbsss@gmail.com', phone: '+971502758533', country: 'United Arab Emirates' },
  { id: 1045, name: 'Milzile Mielies', city: 'Port Elizabeth', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'amaza319@gmail.com', phone: '+27719640477', country: 'South Africa' },
  { id: 1046, name: 'Danki Fx Forex', city: '', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'luckyngobeni164@gmail.com', phone: '+12345678910', country: 'South Africa' },
  { id: 1047, name: 'Kristoffer Aga', city: 'Oslo', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'krisess978@gmail.com', phone: '+4741469891', country: 'Norway' },
  { id: 1048, name: 'Aseeb Kh', city: 'Dubai', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'aseebki6504@gmail.com', phone: '+971054454663', country: 'United Arab Emirates' },
  { id: 1049, name: 'Ahmad Abu', city: 'Tripoli', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'hammed.sera@yahoo.com.au', phone: '+218918011038', country: 'Libya' },
  { id: 1050, name: 'Endinakho Ndumiso', city: 'Dusseldorf', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'flexymarkets@gmail.com', phone: '+27634760524', country: 'Germany' },
  { id: 1051, name: 'Danish Sultan', city: 'New Delhi', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'danishsultan1986@icloud.com', phone: '+919953303646', country: 'India' },
  { id: 1052, name: 'Nikolaus Büttner', city: 'Rheine', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'nb1000@hotmail.de', phone: '+491738964585', country: 'Germany' },
  { id: 1053, name: 'Eiad Jabarin', city: 'Basma', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'ejadsomel@gmail.com', phone: '+972525565059', country: 'Israel' },
  { id: 1054, name: 'Ioob Nnnn', city: 'Ludhiana', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'xostarbvo20@gmail.com', phone: '+919082628830', country: 'India' },
  { id: 1055, name: 'Dibya Kampa', city: 'Chennai', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'dibyakampa01@gmail.com', phone: '+918027655121', country: 'India' },
  { id: 1056, name: 'Nikhil Jagtap', city: 'Pune', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'raj8132496@gmail.com', phone: '+918013496820', country: 'India' },
  { id: 1057, name: 'Jaspal Singh', city: 'Chandigarh', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'jaspalikhangura@gmail.com', phone: '+919216210000', country: 'India' },
  { id: 1058, name: 'Hassan Osman', city: 'Hayes', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'hassanosman5151@gmail.com', phone: '+447591424712', country: 'United Kingdom' },
  { id: 1059, name: 'Jahv Javohin', city: 'Tashkent', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'artoovjaxol@gmail.com', phone: '+998997927151', country: 'Uzbekistan' },
  { id: 1060, name: 'Betsy Solis', city: 'Orlando', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'betsolix27@gmail.com', phone: '13214829265', country: 'United States' },
  { id: 1061, name: 'Wakeel Ahmad', city: 'New Delhi', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'contactwakeel@gmail.com', phone: '+919256060180', country: 'India' },
  { id: 1062, name: 'Samuel Chagadama', city: 'Harare', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'chagaswofficial@gmail.com', phone: '+263788865877', country: 'Zimbabwe' },
  { id: 1063, name: 'Bdmd Uqjud', city: '', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'ss688113088@163.com', phone: '+8613321585557', country: 'China' },
  { id: 1064, name: 'John William Belam', city: 'Peterlee', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'johnbolam@gmail.com', phone: '+447641345764', country: 'United Kingdom' },
  { id: 1065, name: 'Sandhiya Kc', city: 'Kochi', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'rohithkrishna20@gmail.com', phone: '+919895856794', country: 'India' },
  { id: 1066, name: 'Het Patel', city: 'Vadodara', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'het3454@gmail.com', phone: '+919662323454', country: 'India' },
  { id: 1067, name: 'Murat Yigit', city: 'Istanbul', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'muhtaryigit34@gmail.com', phone: '+905525611605', country: 'Turkey' },
  { id: 1068, name: 'Mohan Choudhary Lal', city: 'Jaipur', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'mohanchoudharylal@gmail.com', phone: '+919799222608', country: 'India' },
  { id: 1069, name: 'Hasibullah Ibrahimkhil', city: 'Kabul', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'hasibibrahim2khail@gmail.com', phone: '+933780417642', country: 'Afghanistan' },
  { id: 1070, name: 'Rizki Andika', city: 'Bandung', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'justdika1106@gmail.com', phone: '+628579612272', country: 'Indonesia' },
  { id: 1071, name: 'Vishal Vishal Chikhale', city: 'Pune', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'ricccsdhof74@gmail.com', phone: '+918880214812', country: 'India' },
  { id: 1072, name: 'Alex Gonzales', city: 'Pune', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'admin@alex.com', phone: '+910000000000', country: 'India' },
  { id: 1073, name: 'Roberts Kakost', city: 'Jeddah', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'roberts27@gmail.com', phone: '+966537100074', country: 'Saudi Arabia' },
  { id: 1074, name: 'Alexandri Grigorita', city: 'Dobre', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'grigoritaalexandri@gmail.com', phone: '+4857100514', country: 'Poland' },
  { id: 1075, name: 'As Bb', city: 'Bari', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'pressforte@gmail.com', phone: '+393344337701', country: 'Italy' },
  { id: 1076, name: 'Michie Sa Ireshu', city: 'Jaipur', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'jivan83@gmail.com', phone: '+919413850', country: 'India' },
  { id: 1077, name: 'Gu 5s', city: 'Magetan', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'bagusyu307@gmail.com', phone: '+628506094971', country: 'Indonesia' },
  { id: 1078, name: 'جادع عبد علي', city: 'Sanaa', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'nahlmm11@gmail.com', phone: '+967775783123', country: 'Yemen' },
  { id: 1079, name: 'Ramamoorthy Venkatesh', city: 'Slough', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'royaltradingacademy9@gmail.com', phone: '+917973325045', country: 'India' },
  { id: 1080, name: 'Sony Share', city: 'Nagpur', type: 'Individual', status: 'Unregistered', lead: 'Undefined', email: 'wlb@gmail.com', phone: '+911311166611', country: 'India' },
];

const STATUS_COLORS = {
  Active: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20',
  Inactive: 'text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800',
  Unregistered: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20',
  Pending: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
};

const SortIcon = ({ col, sortCol, sortDir }) => {
  if (sortCol !== col) return <ChevronsUpDown size={10} className="text-gray-400 ml-0.5 inline" />;
  return sortDir === 'asc'
    ? <ChevronUp size={10} className="text-blue-500 ml-0.5 inline" />
    : <ChevronDown size={10} className="text-blue-500 ml-0.5 inline" />;
};

const ClientsDataGrid = ({ search = '', typeFilter = 'All Types', statusFilter = 'All Statuses', countryFilter = 'All Countries' }) => {
  const { data: rawData, isLoading, isFallback } = useDataSource(getClients, CLIENTS_FALLBACK);
  const [sortCol, setSortCol] = useState('id');
  const [sortDir, setSortDir] = useState('asc');
  const [selectedRow, setSelectedRow] = useState(null);
  const [page, setPage] = useState(0);
  const pageSize = 30;

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
    setPage(0);
  };

  const filtered = useMemo(() => {
    let rows = [...rawData];

    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        String(r.id).includes(q) ||
        r.phone.includes(q)
      );
    }
    if (typeFilter !== 'All Types') rows = rows.filter(r => r.type === typeFilter);
    if (statusFilter !== 'All Statuses') rows = rows.filter(r => r.status === statusFilter);
    if (countryFilter !== 'All Countries') rows = rows.filter(r => r.country === countryFilter);

    rows.sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });

    return rows;
  }, [search, typeFilter, statusFilter, countryFilter, sortCol, sortDir]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const TH = ({ col, label, align = 'left', width = '' }) => (
    <th
      className={`px-2 py-1 font-normal border-l border-gray-200 dark:border-[#333333] cursor-pointer select-none whitespace-nowrap hover:bg-gray-200 dark:hover:bg-[#333333] transition-colors ${align === 'right' ? 'text-right' : 'text-left'} ${width}`}
      onClick={() => handleSort(col)}
    >
      {label}
      <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
    </th>
  );

  return (
    <div className="flex flex-col w-full flex-1 bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#333333] rounded-sm shadow-sm overflow-hidden transition-colors">
      {/* Table */}
      <div className="w-full overflow-x-auto flex-1">
        <table className="w-full text-left border-collapse min-w-max">
          <thead>
            <tr className="bg-[#f0f0f0] dark:bg-[#2d2d30] border-b border-gray-200 dark:border-[#333333] text-[11px] text-gray-700 dark:text-gray-300 font-semibold h-8 select-none transition-colors">
              <th
                className="px-2 py-1 font-normal text-left cursor-pointer whitespace-nowrap hover:bg-gray-200 dark:hover:bg-[#333333] transition-colors w-14"
                onClick={() => handleSort('id')}
              >
                ID <SortIcon col="id" sortCol={sortCol} sortDir={sortDir} />
              </th>
              <TH col="name" label="Name" />
              <TH col="city" label="City" />
              <TH col="type" label="Type" />
              <TH col="status" label="Status" />
              <TH col="lead" label="Lead" />
              <TH col="email" label="Email" />
              <TH col="phone" label="Phone" />
              <TH col="country" label="Country" />
            </tr>
          </thead>
          <tbody className="text-[12px] text-gray-800 dark:text-gray-200">
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-gray-400 dark:text-gray-500 text-[14px]">
                  No clients match the current filters.
                </td>
              </tr>
            ) : (
              pageRows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelectedRow(selectedRow === row.id ? null : row.id)}
                  className={`border-b border-gray-100 dark:border-[#2a2a2a] h-7 cursor-pointer transition-colors
                    ${selectedRow === row.id
                      ? 'bg-blue-100 dark:bg-blue-900/30'
                      : 'hover:bg-blue-50 dark:hover:bg-[#252526]'
                    }`}
                >
                  <td className="px-2 py-0.5 whitespace-nowrap flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                    <User size={11} className="text-blue-500 dark:text-blue-400 shrink-0" />
                    {row.id}
                  </td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#2a2a2a] font-medium">{row.name}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#2a2a2a] text-gray-600 dark:text-gray-400">{row.city}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#2a2a2a]">{row.type}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#2a2a2a]">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[row.status] || ''}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#2a2a2a] text-gray-400 dark:text-gray-500">{row.lead}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#2a2a2a] text-blue-600 dark:text-blue-400">
                    <a href={`mailto:${row.email}`} onClick={e => e.stopPropagation()}>{row.email}</a>
                  </td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#2a2a2a] font-mono text-[12px]">{row.phone}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#2a2a2a]">{row.country}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="h-7 border-t border-gray-200 dark:border-[#333333] bg-gray-50 dark:bg-[#252526] flex items-center justify-between px-3 text-[11px] text-gray-500 dark:text-gray-400 transition-colors shrink-0">
        <span className="flex items-center gap-2">
          Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length} clients
          {isFallback && (
            <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-sm">
              <AlertTriangle size={9} />
              DEMO DATA
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-2 py-0.5 border border-gray-300 dark:border-gray-600 rounded-sm text-[12px] hover:bg-gray-100 dark:hover:bg-[#333333] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Prev
          </button>
          <span className="px-2">{page + 1} / {Math.max(1, totalPages)}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-2 py-0.5 border border-gray-300 dark:border-gray-600 rounded-sm text-[12px] hover:bg-gray-100 dark:hover:bg-[#333333] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClientsDataGrid;
