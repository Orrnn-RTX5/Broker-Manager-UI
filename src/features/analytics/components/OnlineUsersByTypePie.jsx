import OnlineUsersDonut from './OnlineUsersDonut';

const OnlineUsersByTypePie = ({ slices = [], total }) => (
  <OnlineUsersDonut slices={slices} total={total} />
);

export default OnlineUsersByTypePie;
