"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualEventService = powerbi.extensibility.IVisualEventService;

import { Interactivity } from "./behaviour/interactivity";
import { applySettings, readInstances } from "./format/applySettings";
import { toRenderOptions } from "./format/toRenderOptions";
import { Formatters } from "./render/format";
import { Renderer } from "./render/renderer";
import { createStrings, paneLocalization, type Strings } from "./render/strings";
import { VisualFormattingSettingsModel } from "./settings";

export class Visual implements IVisual {
    private readonly events: IVisualEventService;
    private readonly renderer: Renderer;
    private readonly interactivity: Interactivity;
    private readonly formattingSettingsService: FormattingSettingsService;
    private readonly host: powerbi.extensibility.visual.IVisualHost;
    private readonly strings: Strings;
    private readonly formatters: Formatters;
    private formattingSettings: VisualFormattingSettingsModel;

    // The generated plugin wrapper declares options as optional, so the constructor must accept that.
    constructor(options?: VisualConstructorOptions) {
        if (!options) {
            throw new Error("Visual constructor options are required");
        }
        const host = options.host;
        this.host = host;
        this.events = host.eventService;
        const localizationManager = host.createLocalizationManager?.();
        this.strings = createStrings(localizationManager);
        this.formattingSettingsService = new FormattingSettingsService(paneLocalization(this.strings) as powerbi.extensibility.ILocalizationManager);
        this.renderer = new Renderer(options.element, {
            colorPalette: host.colorPalette as powerbi.extensibility.ISandboxExtendedColorPalette,
            locale: host.locale,
            localizationManager,
            displayWarningIcon: (hoverText, detailedText) => host.displayWarningIcon(hoverText, detailedText),
        });
        this.formatters = new Formatters(host.locale);
        this.interactivity = new Interactivity(
            {
                selectionManager: host.createSelectionManager(),
                tooltipService: host.tooltipService,
                createSelectionIdBuilder: () => host.createSelectionIdBuilder(),
                allowInteractions: () => host.hostCapabilities?.allowInteractions !== false,
            },
            this.renderer,
        );
        // The Format pane must render before the first update and with nothing bound.
        this.formattingSettings = applySettings(undefined, { palette: host.colorPalette, measures: [], series: [], strings: this.strings }).model;
    }

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);
        try {
            const dataView = options.dataViews?.[0];
            const applied = applySettings(dataView, {
                palette: this.host.colorPalette,
                strings: this.strings,
                ...readInstances(dataView, (groupIndex) => this.seriesSelector(dataView, groupIndex), (value, format) => this.formatters.value(value, format, this.strings("blank"))),
            });
            this.formattingSettings = applied.model;
            const scene = this.renderer.render(dataView, options.viewport, toRenderOptions(applied));
            this.interactivity.update(scene, dataView);
            this.events.renderingFinished(options);
        } catch (error) {
            this.events.renderingFailed(options, String(error));
        }
    }

    /** Selector of one series group, for per-series Format pane settings. */
    private seriesSelector(dataView: powerbi.DataView | undefined, groupIndex: number): powerbi.data.Selector | null {
        const values = dataView?.categorical?.values;
        const group = values?.grouped()[groupIndex];
        if (!values || !group) return null;
        return this.host.createSelectionIdBuilder().withSeries(values, group).createSelectionId().getSelector();
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}
