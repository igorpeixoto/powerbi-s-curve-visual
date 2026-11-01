"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualEventService = powerbi.extensibility.IVisualEventService;

import { summarizeDataView } from "./model/dataViewSummary";
import { VisualFormattingSettingsModel } from "./settings";

export class Visual implements IVisual {
    private readonly events: IVisualEventService;
    private readonly root: HTMLElement;
    private readonly message: HTMLElement;
    private readonly formattingSettingsService: FormattingSettingsService;
    private formattingSettings: VisualFormattingSettingsModel = new VisualFormattingSettingsModel();

    // The generated plugin wrapper declares options as optional, so the constructor must accept that.
    constructor(options?: VisualConstructorOptions) {
        if (!options) {
            throw new Error("Visual constructor options are required");
        }
        this.events = options.host.eventService;
        this.formattingSettingsService = new FormattingSettingsService();

        this.root = document.createElement("div");
        this.root.className = "s-curve";
        this.message = document.createElement("p");
        this.message.className = "s-curve__message";
        this.root.appendChild(this.message);
        options.element.appendChild(this.root);
    }

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);
        try {
            const dataView = options.dataViews?.[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
                VisualFormattingSettingsModel,
                dataView,
            );

            const summary = summarizeDataView(dataView);
            this.root.classList.toggle("s-curve--empty", !summary.hasData);
            this.message.style.fontSize = `${this.formattingSettings.styleCard.typography.fontSize.value}px`;
            this.message.textContent = summary.hasData
                ? `${summary.bucketCount} buckets, ${summary.measureCount} measures`
                : "No data to display. Add a category and at least one measure.";

            this.events.renderingFinished(options);
        } catch (error) {
            this.events.renderingFailed(options, String(error));
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}
