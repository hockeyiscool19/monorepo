import { clearedDoorCookie } from "../domain/cookies.js";
import { readDoorCookies, type DoorDeps, type DoorRequest } from "./door.js";

/** What `DELETE <app.path>/__door/session` answers. */
export interface CloseDoorResult {
  readonly appId: string;
  /** Whose session the browser held, when its envelope opens; for logs only. */
  readonly uid: string | undefined;
  /** The Set-Cookie that removes the door's cookie. */
  readonly setCookie: string;
}

/**
 * Use case: sign a browser out at one door. It always succeeds, needs no token and works while the door is
 * unconfigured, because removing access is always safe. The answer removes the whole door cookie: the platform
 * part and the app cookie sealed under that person's session, which nobody else may inherit (openDoor keeps an
 * app cookie only for the same person, so an app part without its platform part could never be used again).
 */
export function closeDoor(deps: Pick<DoorDeps, "sealer">, request: DoorRequest): CloseDoorResult {
  const { envelope } = readDoorCookies(request.headers, deps.sealer, request.app.id);
  return {
    appId: request.app.id,
    uid: envelope?.p?.uid,
    setCookie: clearedDoorCookie(request.app.path, request.secureCookie),
  };
}
