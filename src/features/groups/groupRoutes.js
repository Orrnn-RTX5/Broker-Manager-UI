export const getGroupDetailsPath = (groupName) =>
  `/groups/${encodeURIComponent(String(groupName ?? ''))}`;

export const getGroupNameFromRouteParam = (groupNameParam) =>
  String(groupNameParam ?? '');
