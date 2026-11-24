import type { ThemeDocument } from './lib/theme-model';

// Exact current project snapshot. Keep the internal theme identity for preview behavior.
export const theme: ThemeDocument = {
  "schemaVersion": 2,
  "name": "edit.here",
  "theme": {
    "name": "Forma",
    "primaryForeground": {
      "light": "neutral-2",
      "dark": "neutral-2"
    },
    "neutralTone": "neutral",
    "colorEmphasis": 50,
    "iconFamily": "Lucide",
    "iconStyle": "outlined",
    "buttonRadius": "s",
    "primaryActionColor": "color-1",
    "colors": {
      "light": {
        "neutral-1": "#ffffff",
        "neutral-2": "#fafafa",
        "neutral-3": "#f2f2f3",
        "neutral-4": "#e4e4e7",
        "neutral-5": "#c5c5ca",
        "neutral-6": "#94949c",
        "neutral-7": "#6e6e76",
        "neutral-8": "#505057",
        "neutral-9": "#343438",
        "neutral-10": "#202124",
        "color-1": "#7d43bd",
        "color-2": "#e1cdf3",
        "color-3": "#b8d4c4",
        "color-4": "#e5c7b8",
        "success": "#247348",
        "warning": "#94651e",
        "error": "#bd3d42"
      },
      "dark": {
        "neutral-1": "#171719",
        "neutral-2": "#202023",
        "neutral-3": "#2a2a2e",
        "neutral-4": "#3b3b40",
        "neutral-5": "#55555d",
        "neutral-6": "#80808a",
        "neutral-7": "#ababB4",
        "neutral-8": "#cdCDD3",
        "neutral-9": "#e8e8ed",
        "neutral-10": "#fafafa",
        "color-1": "#d5adff",
        "color-2": "#9974b8",
        "color-3": "#94b8a4",
        "color-4": "#c6a492",
        "success": "#8fd5ad",
        "warning": "#e5c279",
        "error": "#f49fa5"
      }
    },
    "fonts": {
      "body": {
        "family": "\"Sidebar Inter\", sans-serif",
        "weights": {
          "regular": 400,
          "medium": 500,
          "heavy": 600
        }
      },
      "display": {
        "family": "\"Sidebar Inter\", sans-serif",
        "weights": {
          "regular": 400,
          "medium": 500,
          "heavy": 600
        }
      },
      "data": {
        "family": "\"Sidebar Inter\", sans-serif",
        "weights": {
          "regular": 400,
          "medium": 500,
          "heavy": 600
        }
      }
    },
    "text": {
      "xxs": {
        "size": 10,
        "lineHeight": 14
      },
      "xs": {
        "size": 12,
        "lineHeight": 16
      },
      "s": {
        "size": 14,
        "lineHeight": 20
      },
      "m": {
        "size": 16,
        "lineHeight": 24
      },
      "l": {
        "size": 24,
        "lineHeight": 32
      },
      "xl": {
        "size": 36,
        "lineHeight": 40
      },
      "xxl": {
        "size": 48,
        "lineHeight": 52
      }
    },
    "spacing": {
      "zero": 0,
      "xxs": 4,
      "xs": 8,
      "s": 12,
      "m": 16,
      "l": 24,
      "xl": 32,
      "xxl": 48
    },
    "radius": {
      "zero": 0,
      "xs": 4,
      "s": 8,
      "m": 12,
      "l": 20,
      "xl": 28,
      "full": 9999
    },
    "border": {
      "none": 0,
      "s": 1,
      "m": 1,
      "l": 2
    },
    "shadows": {
      "s": {
        "x": 0,
        "y": 1,
        "blur": 3,
        "spread": 0,
        "opacity": 12,
        "color": {
          "light": "neutral-10",
          "dark": "neutral-1"
        }
      },
      "m": {
        "x": 0,
        "y": 4,
        "blur": 16,
        "spread": 0,
        "opacity": 10,
        "color": {
          "light": "neutral-10",
          "dark": "neutral-1"
        }
      },
      "l": {
        "x": 0,
        "y": 12,
        "blur": 36,
        "spread": 0,
        "opacity": 14,
        "color": {
          "light": "neutral-10",
          "dark": "neutral-1"
        }
      }
    },
    "surfaceDetails": {
      "edgeColor": "neutral-6-transparent",
      "light": {
        "highlight": 70,
        "shade": 16,
        "gradientTop": 12,
        "gradientBottom": 5,
        "recessedShade": 8
      },
      "dark": {
        "highlight": 24,
        "shade": 24,
        "gradientTop": 10,
        "gradientBottom": 12,
        "recessedShade": 20
      }
    },
    "focusRing": {
      "color": "color-1",
      "width": "l",
      "opacity": 55
    },
    "animation": {
      "duration": 160,
      "easing": [
        0.16,
        1,
        0.3,
        1
      ],
      "large": {
        "duration": 300,
        "easing": [
          0.22,
          1,
          0.36,
          1
        ]
      },
      "popupScale": 0.98,
      "pressDistance": 1
    },
    "adjustmentBaseline": {
      "version": 1,
      "textM": 16,
      "text": {
        "xxs": {
          "size": 10,
          "lineHeight": 14
        },
        "xs": {
          "size": 12,
          "lineHeight": 16
        },
        "s": {
          "size": 14,
          "lineHeight": 20
        },
        "m": {
          "size": 16,
          "lineHeight": 24
        },
        "l": {
          "size": 24,
          "lineHeight": 32
        },
        "xl": {
          "size": 36,
          "lineHeight": 40
        },
        "xxl": {
          "size": 48,
          "lineHeight": 52
        }
      },
      "spacing": {
        "zero": 0,
        "xxs": 4,
        "xs": 8,
        "s": 12,
        "m": 16,
        "l": 24,
        "xl": 32,
        "xxl": 48
      },
      "character": {
        "profile": "forma",
        "radius": {
          "zero": 0,
          "xs": 4,
          "s": 8,
          "m": 12,
          "l": 20,
          "xl": 28,
          "full": 9999
        },
        "border": {
          "none": 0,
          "s": 1,
          "m": 1,
          "l": 2
        },
        "weights": {
          "body": {
            "regular": 400,
            "medium": 500,
            "heavy": 600
          },
          "display": {
            "regular": 400,
            "medium": 500,
            "heavy": 600
          },
          "data": {
            "regular": 400,
            "medium": 500,
            "heavy": 600
          }
        },
        "colorEmphasis": 50,
        "buttonRadius": "s"
      }
    },
    "letterSpacing": {
      "xs": -0.02,
      "s": -0.01,
      "m": 0,
      "l": 0.01,
      "xl": 0.02
    },
    "colorPalettes": [
      {
        "id": "forma-graphite",
        "name": "Graphite",
        "description": "Graphite with restrained, complementary accents.",
        "colors": {
          "light": [
            "#37373d",
            "#dfddd8",
            "#b5c5cd",
            "#c7b3a1"
          ],
          "dark": [
            "#e2e2e8",
            "#8c8983",
            "#8daab8",
            "#bca58d"
          ]
        },
        "primaryForeground": {
          "light": "neutral-2",
          "dark": "neutral-2"
        }
      },
      {
        "id": "forma-blue",
        "name": "Blue",
        "description": "Blue with restrained, complementary accents.",
        "colors": {
          "light": [
            "#285de0",
            "#c6d7f7",
            "#b8c8d5",
            "#e3c7aa"
          ],
          "dark": [
            "#94b6ff",
            "#5877b2",
            "#8da7ba",
            "#c7aa8d"
          ]
        },
        "primaryForeground": {
          "light": "neutral-2",
          "dark": "neutral-2"
        }
      },
      {
        "id": "forma-indigo",
        "name": "Indigo",
        "description": "Indigo with restrained, complementary accents.",
        "colors": {
          "light": [
            "#514bb9",
            "#d1cff4",
            "#b2c9ce",
            "#d9c6b1"
          ],
          "dark": [
            "#b7b0ff",
            "#8178bb",
            "#91b3bb",
            "#baa189"
          ]
        },
        "primaryForeground": {
          "light": "neutral-2",
          "dark": "neutral-2"
        }
      },
      {
        "id": "forma-violet",
        "name": "Violet",
        "description": "Violet with restrained, complementary accents.",
        "colors": {
          "light": [
            "#7d43bd",
            "#e1cdf3",
            "#b8d4c4",
            "#e5c7b8"
          ],
          "dark": [
            "#d5adff",
            "#9974b8",
            "#94b8a4",
            "#c6a492"
          ]
        },
        "primaryForeground": {
          "light": "neutral-2",
          "dark": "neutral-2"
        }
      },
      {
        "id": "forma-rose",
        "name": "Rose",
        "description": "Rose with restrained, complementary accents.",
        "colors": {
          "light": [
            "#ac3c65",
            "#eccbd8",
            "#c5c9e1",
            "#d7d1b8"
          ],
          "dark": [
            "#f4a8c3",
            "#ae748b",
            "#a3a9c7",
            "#b9b192"
          ]
        },
        "primaryForeground": {
          "light": "neutral-2",
          "dark": "neutral-2"
        }
      },
      {
        "id": "forma-red",
        "name": "Red",
        "description": "Red with restrained, complementary accents.",
        "colors": {
          "light": [
            "#be3d36",
            "#f2cec8",
            "#b9c7d7",
            "#ded5bd"
          ],
          "dark": [
            "#ffa59b",
            "#bb7d75",
            "#97aec3",
            "#bfb293"
          ]
        },
        "primaryForeground": {
          "light": "neutral-2",
          "dark": "neutral-2"
        }
      },
      {
        "id": "forma-orange",
        "name": "Orange",
        "description": "Orange with restrained, complementary accents.",
        "colors": {
          "light": [
            "#a8521b",
            "#efd2ae",
            "#b6cbd1",
            "#d4ccba"
          ],
          "dark": [
            "#efb480",
            "#b58c5c",
            "#91b2bb",
            "#b3a78f"
          ]
        },
        "primaryForeground": {
          "light": "neutral-2",
          "dark": "neutral-2"
        }
      },
      {
        "id": "forma-monochrome",
        "name": "Monochrome",
        "description": "Graphite and cool grays without colored accents.",
        "colors": {
          "light": [
            "#28282c",
            "#74747a",
            "#bababf",
            "#e8e8eb"
          ],
          "dark": [
            "#e8e8eb",
            "#bababf",
            "#74747a",
            "#3b3b40"
          ]
        },
        "primaryForeground": {
          "light": "neutral-2",
          "dark": "neutral-2"
        }
      },
      {
        "id": "forma-gold",
        "name": "Gold",
        "description": "Gold with restrained, complementary accents.",
        "colors": {
          "light": [
            "#85631b",
            "#ead9a1",
            "#bbc9df",
            "#ced2b6"
          ],
          "dark": [
            "#dfc579",
            "#ac995c",
            "#98aece",
            "#aeb993"
          ]
        },
        "primaryForeground": {
          "light": "neutral-2",
          "dark": "neutral-2"
        }
      },
      {
        "id": "forma-olive",
        "name": "Olive",
        "description": "Olive with restrained, complementary accents.",
        "colors": {
          "light": [
            "#626d2a",
            "#d9dfb6",
            "#b9cbd0",
            "#e0ccb8"
          ],
          "dark": [
            "#c5d18b",
            "#939f69",
            "#99b6be",
            "#c0a58a"
          ]
        },
        "primaryForeground": {
          "light": "neutral-2",
          "dark": "neutral-2"
        }
      },
      {
        "id": "forma-green",
        "name": "Green",
        "description": "Green with restrained, complementary accents.",
        "colors": {
          "light": [
            "#287345",
            "#c1dfc9",
            "#b7cfdf",
            "#ded0b5"
          ],
          "dark": [
            "#93d7ac",
            "#679774",
            "#8db0c7",
            "#bead8d"
          ]
        },
        "primaryForeground": {
          "light": "neutral-2",
          "dark": "neutral-2"
        }
      },
      {
        "id": "forma-teal",
        "name": "Teal",
        "description": "Teal with restrained, complementary accents.",
        "colors": {
          "light": [
            "#247474",
            "#bce0d9",
            "#c0c9df",
            "#dfcbb6"
          ],
          "dark": [
            "#8ed6cd",
            "#659b94",
            "#9aa8c7",
            "#bfaa91"
          ]
        },
        "primaryForeground": {
          "light": "neutral-2",
          "dark": "neutral-2"
        }
      },
      {
        "id": "forma-slate",
        "name": "Slate",
        "description": "Slate with restrained, complementary accents.",
        "colors": {
          "light": [
            "#526574",
            "#d0dbe2",
            "#c6d1c0",
            "#d9c4b7"
          ],
          "dark": [
            "#b1c8d9",
            "#7d94a5",
            "#9dad92",
            "#b89b8b"
          ]
        },
        "primaryForeground": {
          "light": "neutral-2",
          "dark": "neutral-2"
        }
      }
    ],
    "paletteBaseNeutrals": {
      "light": {
        "neutral-1": "#ffffff",
        "neutral-2": "#fafafa",
        "neutral-3": "#f2f2f3",
        "neutral-4": "#e4e4e7",
        "neutral-5": "#c5c5ca",
        "neutral-6": "#94949c",
        "neutral-7": "#6e6e76",
        "neutral-8": "#505057",
        "neutral-9": "#343438",
        "neutral-10": "#202124"
      },
      "dark": {
        "neutral-1": "#171719",
        "neutral-2": "#202023",
        "neutral-3": "#2a2a2e",
        "neutral-4": "#3b3b40",
        "neutral-5": "#55555d",
        "neutral-6": "#80808a",
        "neutral-7": "#ababB4",
        "neutral-8": "#cdCDD3",
        "neutral-9": "#e8e8ed",
        "neutral-10": "#fafafa"
      }
    },
    "keyColorPalette": [
      "#37373d",
      "#285de0",
      "#514bb9",
      "#7d43bd",
      "#ac3c65",
      "#be3d36",
      "#a8521b",
      "#28282c",
      "#85631b",
      "#626d2a",
      "#287345",
      "#247474",
      "#526574"
    ]
  },
  "componentTokens": {
    "button:primary:rest": {
      "borderColor": "neutral-6-transparent",
      "shadow": "s"
    },
    "button:primary:hover": {
      "borderColor": "neutral-7-transparent",
      "shadow": "s"
    },
    "button:primary:focus": {
      "borderColor": "neutral-7-transparent",
      "shadow": "s"
    },
    "button:secondary:rest": {
      "background": "neutral-1",
      "borderColor": "neutral-6-transparent",
      "shadow": "s"
    },
    "button:secondary:hover": {
      "background": "neutral-2",
      "borderColor": "neutral-7-transparent",
      "shadow": "s"
    },
    "button:secondary:focus": {
      "background": "neutral-2",
      "borderColor": "neutral-7-transparent",
      "shadow": "s"
    },
    "button:outline:rest": {
      "borderColor": "neutral-6-transparent"
    }
  },
  "componentVariants": {}
};
