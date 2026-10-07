import tippy, { hideAll } from "tippy.js";

/**
 * Shows the `data-tooltip` of the element under the pointer, which the UI uses instead of `title`. A tooltip is
 * made the first time its element is hovered and only kept on it, so it goes with the element, and reads the
 * attribute each time it shows.
 */
export function initTooltips() {
	document.addEventListener("mouseover", (event) => {
		const element = (event.target as Element).closest<HTMLElement>("[data-tooltip]");
		if (!element || "_tippy" in element) return;
		tippy(element, {
			theme: "launcher",
			arrow: false,
			trigger: "mouseenter",
			delay: [300, 0],
			showOnCreate: true,
			onShow(instance) {
				const text = element.dataset.tooltip;
				if (!text) return false;
				instance.setContent(text);
				// One at a time, like title: an element's over its parent's
				hideAll({ exclude: instance, duration: 0 });
			},
		});
	});
}
