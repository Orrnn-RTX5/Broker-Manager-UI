export const getGroupDetailsPath = (groupName) =>
  `/groups/${encodeURIComponent(String(groupName ?? ''))}`;

export const getGroupNameFromRouteParam = (groupNameParam) =>
  String(groupNameParam ?? '');

export const GROUPS_PATH = '/groups';
export const GROUPS_FOLDER_PARAM = 'path';
export const GROUPS_SELECTED_PARAM = 'group';

/** Explorer location for a folder such as `PREP\contest`; the root folder is plain /groups. */
export const getGroupsFolderPath = (folder = '', group = '') => {
  const query = [
    folder ? `${GROUPS_FOLDER_PARAM}=${encodeURIComponent(String(folder))}` : '',
    group ? `${GROUPS_SELECTED_PARAM}=${encodeURIComponent(String(group))}` : '',
  ].filter(Boolean).join('&');
  return query ? `${GROUPS_PATH}?${query}` : GROUPS_PATH;
};

export const getGroupsFolderFromSearch = (search = '') =>
  new URLSearchParams(String(search ?? '')).get(GROUPS_FOLDER_PARAM) ?? '';

/** Group whose row the explorer selects, set when a group is picked in the Navigator. */
export const getGroupsSelectedFromSearch = (search = '') =>
  new URLSearchParams(String(search ?? '')).get(GROUPS_SELECTED_PARAM) ?? '';
