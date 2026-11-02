"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualEventService = powerbi.extensibility.IVisualEventService;

import { Interactivity } from "./behaviour/interactivity";
import { defaultRenderOptions } from "./render/options";
import { Renderer } from "./render/renderer";
import { VisualFormattingSettingsModel } from "./settings";

export class Visual implements IVisual {
    private readonly events: IVisualEventService;
    private readonly renderer: Renderer;
    private readonly interactivity: Interactivity;
    private readonly formattingSettingsService: FormattingSettingsService;
    private formattingSettings: VisualFormattingSettingsModel = new VisualFormattingSettingsModel();

    // The generated plugin wrapper declares options as optional, so the constructor must accept that.
    constructor(options?: VisualConstructorOptions) {
        if (!options) {
            throw new Error("Visual constructor options are required");
        }
        const host = options.host;
        this.events = host.eventService;
        this.formattingSettingsService = new FormattingSettingsService();
        this.renderer = new Renderer(options.element, {
            colorPalette: host.colorPalette as powerbi.extensibility.ISandboxExtendedColorPalette,
            locale: host.locale,
            localizationManager: host.createLocalizationManager?.(),
            displayWarningIcon: (hoverText, detailedText) => host.displayWarningIcon(hoverText, detailedText),
        });
        this.interactivity = new Interactivity(
            {
                selectionManager: host.createSelectionManager(),
                tooltipService: host.tooltipService,
                createSelectionIdBuilder: () => host.createSelectionIdBuilder(),
                allowInteractions: () => host.hostCapabilities?.allowInteractions !== false,
            },
            this.renderer,
        );
    }

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);
        try {
            const dataView = options.dataViews?.[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
                VisualFormattingSettingsModel,
                dataView,
            );
            // Phase 5 resolves these from the Format pane and the style preset; until then, the Base defaults.
            const scene = this.renderer.render(dataView, options.viewport, defaultRenderOptions);
            this.interactivity.update(scene, dataView);
            this.events.renderingFinished(options);
        } catch (error) {
            this.events.renderingFailed(options, String(error));
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}
