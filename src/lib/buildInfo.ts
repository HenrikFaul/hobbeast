export interface HobbeastBuildInfo {
  version: string;
  commitSha: string;
  timestamp: string;
}

declare const __HOBBEAST_BUILD__: HobbeastBuildInfo;

const injectedBuildInfo = typeof __HOBBEAST_BUILD__ === 'undefined'
  ? { version: 'local-unknown', commitSha: 'local', timestamp: '1970-01-01T00:00:00.000Z' }
  : __HOBBEAST_BUILD__;

export const HOBBEAST_BUILD_INFO: HobbeastBuildInfo = Object.freeze({
  version: injectedBuildInfo.version,
  commitSha: injectedBuildInfo.commitSha,
  timestamp: injectedBuildInfo.timestamp,
});

export function buildReleaseLabel(info: HobbeastBuildInfo = HOBBEAST_BUILD_INFO) {
  const shortCommit = info.commitSha === 'local' ? 'local' : info.commitSha.slice(0, 12);
  return `${info.version}+${shortCommit}`;
}
