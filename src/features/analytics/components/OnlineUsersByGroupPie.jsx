import OnlineUsersDonut from './OnlineUsersDonut';

const OnlineUsersByGroupPie = ({ slices = [], total }) => (
  <OnlineUsersDonut slices={slices} total={total} />
);

export default OnlineUsersByGroupPie;
