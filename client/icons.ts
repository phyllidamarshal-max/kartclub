import flag from "@phosphor-icons/core/assets/fill/flag-checkered-fill.svg";
import rocket from "@phosphor-icons/core/assets/fill/rocket-launch-fill.svg";
import timer from "@phosphor-icons/core/assets/bold/timer-bold.svg";
import wheel from "@phosphor-icons/core/assets/bold/steering-wheel-bold.svg";
import gear from "@phosphor-icons/core/assets/fill/gear-six-fill.svg";
import globe from "@phosphor-icons/core/assets/bold/globe-bold.svg";
import arrow from "@phosphor-icons/core/assets/bold/arrow-right-bold.svg";
import close from "@phosphor-icons/core/assets/bold/x-bold.svg";
import pause from "@phosphor-icons/core/assets/fill/pause-fill.svg";
import trophy from "@phosphor-icons/core/assets/fill/trophy-fill.svg";
import user from "@phosphor-icons/core/assets/fill/user-fill.svg";
import plus from "@phosphor-icons/core/assets/bold/plus-bold.svg";
import star from "@phosphor-icons/core/assets/fill/star-fill.svg";
import lock from "@phosphor-icons/core/assets/fill/lock-key-fill.svg";
import sliders from "@phosphor-icons/core/assets/bold/sliders-horizontal-bold.svg";
import shield from "@phosphor-icons/core/assets/fill/shield-check-fill.svg";
import warning from "@phosphor-icons/core/assets/fill/warning-fill.svg";
import lightning from "@phosphor-icons/core/assets/fill/lightning-fill.svg";
import xLogo from "@phosphor-icons/core/assets/regular/x-logo.svg";
const assets = {
  flag,
  rocket,
  timer,
  wheel,
  gear,
  globe,
  arrow,
  close,
  pause,
  trophy,
  user,
  plus,
  star,
  lock,
  sliders,
  shield,
  warning,
  lightning,
  xLogo,
};
export type Icon = keyof typeof assets;
export function icon(name: Icon, className = "") {
  const url = assets[name].replace(/'/g, "%27").replace(/"/g, "%22");
  return `<span class="ui-icon ${className}" style="--icon:url('${url}')" aria-hidden="true"></span>`;
}
