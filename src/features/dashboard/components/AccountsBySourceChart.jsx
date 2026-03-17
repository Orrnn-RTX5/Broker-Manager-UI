import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

const data = [
  { name: 'None', value: 100 }
];

const COLORS = ['#F28D54'];

const AccountsBySourceChart = ({ onClick }) => {
  return (
    <div
      className="bg-white dark:bg-[#1e1e1e] p-4 rounded-sm border border-gray-200 dark:border-[#333333] shadow-sm h-96 flex flex-col cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all group"
      onClick={onClick}
    >
      <div className="text-[13px] font-semibold text-gray-800 dark:text-gray-200 mb-2 h-5 text-center sm:text-left group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">All Accounts by Source <span className="text-[10px] text-gray-400 dark:text-gray-500 font-normal ml-2">(Click for Details)</span></div>
      <div className="flex-1 w-full relative flex items-center justify-center">

        {/* Recharts Pie */}
        <div className="w-1/2 h-full flex items-center justify-center relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={70}
                fill="#8884d8"
                paddingAngle={0}
                dataKey="value"
                stroke="none"
                isAnimationActive={false}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="w-1/2 flex items-center justify-start pl-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#F28D54]"></div>
            <span className="text-[12px] text-gray-600 dark:text-gray-400">None</span>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AccountsBySourceChart;
