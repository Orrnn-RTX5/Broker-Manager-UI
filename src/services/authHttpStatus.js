export const isAuthExpiredStatus = (status) => Number(status) === 401;

export const isPermissionDeniedStatus = (status) => Number(status) === 403;
