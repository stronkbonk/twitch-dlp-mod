const WRONG_TIME_SYNTAX = 'Wrong time syntax';

// 45 / 5:10 / 1:02:03 / 99:00:00
const CLOCK_TIME_REGEX =
  /^(?:(?:(?<h>\d{1,2}):)?(?<m>\d{1,2}):)?(?<s>\d{1,2})$/;
// 45s / 30m / 1h30m / 2h
const UNIT_TIME_REGEX =
  /^(?:(?<h>\d+(?:\.\d+)?)h)?(?:(?<m>\d+(?:\.\d+)?)m)?(?:(?<s>\d+(?:\.\d+)?)s)?$/;

type TimeGroups = {
  h?: string;
  m?: string;
  s?: string;
};

const getParts = (groups: TimeGroups | undefined) => {
  const { h, m, s } = groups || {};
  if (h === undefined && m === undefined && s === undefined) return null;
  const parts = {
    h: h ? Number.parseFloat(h) : 0,
    m: m ? Number.parseFloat(m) : 0,
    s: s ? Number.parseFloat(s) : 0,
  };
  if (Number.isNaN(parts.h) || Number.isNaN(parts.m) || Number.isNaN(parts.s)) {
    return null;
  }
  return parts;
};

const toSeconds = ({ h, m, s }: { h: number; m: number; s: number }) =>
  h * 60 * 60 + m * 60 + s;

/**
 * Parses a time value (sec).
 * Supported formats:
 * - `15`, `600` (sec)
 * - `5:10` (min:sec), `1:02:03` (hour:min:sec)
 * - `45s`, `30m`, `1h30m`, `2h`
 */
export const parseTime = (value: string) => {
  const str = `${value}`.trim();

  // plain numbers are seconds
  if (/^\d+$/.test(str)) return Number.parseInt(str, 10);

  const clock = str.match(CLOCK_TIME_REGEX);
  if (clock) {
    const parts = getParts(clock.groups);
    if (!parts || parts.m >= 60 || parts.s >= 60) {
      throw new Error(WRONG_TIME_SYNTAX);
    }
    return toSeconds(parts);
  }

  const unit = str.match(UNIT_TIME_REGEX);
  if (unit) {
    const parts = getParts(unit.groups);
    if (!parts) throw new Error(WRONG_TIME_SYNTAX);
    return toSeconds(parts);
  }

  throw new Error(WRONG_TIME_SYNTAX);
};
