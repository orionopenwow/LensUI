// Window mock for the Lens Snip gallery: the base proxy plus the size classes Record.tsx uses.
export { getCurrentWindow } from "../mock/window";
export class LogicalSize {
  constructor(public width: number, public height: number) {}
}
export class PhysicalSize {
  constructor(public width: number, public height: number) {}
}
