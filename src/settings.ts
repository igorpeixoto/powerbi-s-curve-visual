"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import Card = formattingSettings.CompositeCard;
import Group = formattingSettings.Group;
import Model = formattingSettings.Model;

class TypographyGroup extends Group {
    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Text size",
        value: 12,
    });

    constructor() {
        super({ name: "typography", displayName: "Font" });
        this.slices = [this.fontSize];
    }
}

/** Placeholder card for Phase 0; the full Format pane is designed in Phase 5. */
class StyleCard extends Card {
    name = "style";
    displayName = "Style";
    typography = new TypographyGroup();
    groups = [this.typography];
}

export class VisualFormattingSettingsModel extends Model {
    styleCard = new StyleCard();
    cards = [this.styleCard];
}
