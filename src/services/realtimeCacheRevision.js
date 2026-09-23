// Shared by the API and sidebar without introducing a circular import.
let revision = 0;
export const getRealtimeCacheRevision = () => revision;
export const advanceRealtimeCacheRevision = () => { revision += 1; };
