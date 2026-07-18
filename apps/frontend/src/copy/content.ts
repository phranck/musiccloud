import { commonCopy } from "@/copy/common";

const errorCodeTemplates = {
  "MC-URL-0001":
    "This URL isn't supported. Try a link from Spotify, Apple Music, YouTube, Tidal, Deezer, SoundCloud, or another supported service. ({code})",
  "MC-URL-0002": "This doesn't look like a music link. Try pasting a link from a supported service. ({code})",
  "MC-URL-0003": "That URL looks malformed. Please paste the full link from the streaming service. ({code})",
  "MC-URL-0004": "Playlists aren't supported yet. Paste a link to a single track or album instead. ({code})",
  "MC-URL-0005": "Podcasts aren't resolved yet. Paste a link to a single track, album, or artist instead. ({code})",
  "MC-URL-0006": "Try pasting a link to a specific song or open the album page and share from there. ({code})",
  "MC-URL-0007": "This service is currently disabled. Please try a link from another service. ({code})",
  "MC-RES-0001": "This track doesn't seem to be available anymore on the source service. ({code})",
  "MC-RES-0002": "We couldn't find this on other services. It may be exclusive to the source. ({code})",
  "MC-RES-0003": "The requested resource was not found. ({code})",
  "MC-API-0001": "One of the services is temporarily unavailable. Please try again. ({code})",
  "MC-API-0002": "All services are currently unreachable. Please try again in a few minutes. ({code})",
  "MC-API-0003":
    "Too many requests. You can make {limit} requests per {windowSeconds} seconds. Please try again in {retryAfterSeconds} seconds. ({code})",
  "MC-API-0004": "Something went wrong talking to a service. Please try again. ({code})",
  "MC-API-0005": "This is taking longer than usual. Please try again. ({code})",
  "MC-REQ-0001": "The request is invalid. Please check your input. ({code})",
  "MC-REQ-0002": "The request conflicts with the current state. ({code})",
  "MC-AUTH-0001": "You need to sign in before performing this action. ({code})",
  "MC-AUTH-0002": "You do not have permission to perform this action. ({code})",
  "MC-DB-0001": "The database permissions are invalid for this operation. ({code})",
  "MC-DB-0002": "A required database table or schema is missing. ({code})",
  "MC-DB-0003": "The database is temporarily unavailable. ({code})",
  "MC-DB-0004": "A database operation failed. ({code})",
  "MC-SYS-0001": "An unexpected backend error occurred. ({code})",
  "MC-SYS-0002": "The backend could not be reached. ({code})",
} as const satisfies Record<string, string>;

function isKnownErrorCode(code: string): code is keyof typeof errorCodeTemplates {
  return Object.hasOwn(errorCodeTemplates, code);
}

export function contentErrorMessage(code: string, context: Record<string, string> = {}): string {
  if (!isKnownErrorCode(code)) return commonCopy.error.genericWithCode(code);

  let missingValue = false;
  const values: Record<string, string> = { ...context, code };
  const message = errorCodeTemplates[code].replace(/\{(\w+)\}/g, (_placeholder, key: string) => {
    const value = values[key];
    if (value === undefined) {
      missingValue = true;
      return "";
    }
    return value;
  });

  return missingValue ? commonCopy.error.genericWithCode(code) : message;
}
