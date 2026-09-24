import { useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import TradingAccountsDashboard from './TradingAccountsDashboard';
import { loadAnalyticsTree, findNodeInfo } from '../../components/analyticsNavigatorState';

export default function CustomAnalyticsDashboard() {
  const { reportId } = useParams();
  const location = useLocation();

  const title = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    const queryName = searchParams.get('name');
    if (queryName) return queryName;

    if (reportId) {
      const tree = loadAnalyticsTree();
      const info = findNodeInfo(tree, reportId);
      if (info?.node?.label) return info.node.label;
    }
    return 'Custom Analytics Report';
  }, [reportId, location.search]);

  return <TradingAccountsDashboard title={title} />;
}
