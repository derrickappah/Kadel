{
  "brand": {
    "name": "KaDel Ghana",
    "visual_personality": [
      "celebratory + academic (graduation prestige)",
      "Ghanaian warmth (kente-inspired geometry as subtle accents)",
      "mobile-first clarity (non-technical friendly)",
      "trustworthy payments (Paystack-ready)",
      "data-rich admin (clean, scannable tables)"
    ],
    "design_style_fusion": {
      "layout_principle": "Bento grid + Z-pattern hero + step-wizard flow",
      "surface_style": "Warm minimalism with subtle grain + soft shadows (no heavy gradients)",
      "cultural_motif": "Micro kente weave pattern used only as thin dividers / corner accents / section headers (≤ 8px height)"
    }
  },

  "typography": {
    "google_fonts_import": {
      "instructions": "Add to /app/frontend/src/index.css at the very top (before @tailwind):",
      "css": "@import url('https://fonts.googleapis.com/css2?family=Gloock&family=Manrope:wght@400;500;600;700&display=swap');"
    },
    "font_pairing": {
      "display": {
        "family": "Gloock",
        "usage": "Hero headline, section titles, confirmation code headline",
        "notes": "Feels ceremonial/editorial without being generic. Use sparingly."
      },
      "body": {
        "family": "Manrope",
        "usage": "All UI text, forms, admin tables",
        "notes": "High legibility on mobile; friendly Ghanaian warmth when paired with cream backgrounds."
      }
    },
    "type_scale_tailwind": {
      "h1": "text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight",
      "h2": "text-base md:text-lg font-medium text-muted-foreground",
      "section_title": "text-xl sm:text-2xl font-semibold",
      "card_title": "text-base font-semibold",
      "body": "text-sm sm:text-base",
      "small": "text-xs text-muted-foreground"
    },
    "css_tokens": {
      "instructions": "Add to :root in /app/frontend/src/index.css",
      "tokens": {
        "--font-display": "Gloock, ui-serif, Georgia, serif",
        "--font-body": "Manrope, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
      }
    }
  },

  "color_system": {
    "notes": [
      "Avoid purple (per rules).",
      "Use teal as primary (trust + freshness), gold as celebratory accent, cream as warm background.",
      "Gradients only as subtle section background overlays (≤20% viewport)."
    ],
    "palette_hex": {
      "cream": "#FBF7EF",
      "paper": "#FFFDF8",
      "ink": "#121417",
      "charcoal": "#1E2329",
      "teal_700": "#0F766E",
      "teal_600": "#0D9488",
      "teal_100": "#CCFBF1",
      "gold_500": "#D4A017",
      "gold_100": "#FFF1C2",
      "clay": "#C86B3C",
      "success": "#16A34A",
      "danger": "#DC2626",
      "info": "#0284C7",
      "border": "#E7DED0"
    },
    "shadcn_hsl_tokens": {
      "instructions": "Replace the existing :root tokens in /app/frontend/src/index.css with these (keep .dark optional but not required for MVP).",
      "tokens": {
        "--background": "38 56% 96%",
        "--foreground": "215 20% 8%",
        "--card": "40 100% 99%",
        "--card-foreground": "215 20% 8%",
        "--popover": "40 100% 99%",
        "--popover-foreground": "215 20% 8%",

        "--primary": "174 78% 28%",
        "--primary-foreground": "40 100% 98%",

        "--secondary": "38 35% 92%",
        "--secondary-foreground": "215 20% 12%",

        "--muted": "38 28% 92%",
        "--muted-foreground": "215 10% 38%",

        "--accent": "45 92% 55%",
        "--accent-foreground": "215 20% 10%",

        "--destructive": "0 84% 55%",
        "--destructive-foreground": "40 100% 98%",

        "--border": "36 28% 86%",
        "--input": "36 28% 86%",
        "--ring": "174 78% 28%",

        "--radius": "0.85rem",

        "--chart-1": "174 78% 28%",
        "--chart-2": "45 92% 55%",
        "--chart-3": "199 89% 48%",
        "--chart-4": "24 75% 52%",
        "--chart-5": "152 60% 40%"
      }
    },
    "gradients": {
      "allowed_usage": [
        "Hero background overlay only",
        "Large section background bands only",
        "Decorative corner blobs behind images"
      ],
      "gradient_recipes": {
        "hero_wash": "radial-gradient(900px circle at 20% 10%, rgba(13,148,136,0.18), transparent 55%), radial-gradient(700px circle at 85% 20%, rgba(212,160,23,0.16), transparent 52%)",
        "subtle_footer": "linear-gradient(90deg, rgba(13,148,136,0.10), rgba(255,241,194,0.12))"
      }
    }
  },

  "layout_and_grid": {
    "container": {
      "max_width": "max-w-6xl",
      "padding": "px-4 sm:px-6",
      "section_spacing": "py-10 sm:py-14",
      "notes": "Use generous whitespace; avoid centered text blocks except hero headline."
    },
    "page_structures": {
      "landing": "Hero (CTA) → How it works (3 steps) → Packages/Food preview → Trust (Paystack + WhatsApp) → FAQ → Footer",
      "booking_wizard": "Sticky progress header → Step card (form) → Bottom action bar (Back/Next/Pay)",
      "admin": "Left rail (Sheet on mobile) + top bar → KPI cards → tabs for Bookings/Payments/Products/Tables/Dates"
    },
    "responsive_rules": {
      "mobile_first": "Single column; bottom sticky CTA for wizard",
      "md": "Two-column review step (summary right, selections left)",
      "lg": "Admin tables with side filters; keep primary actions top-right"
    }
  },

  "components": {
    "component_path": {
      "shadcn_primary": "/app/frontend/src/components/ui",
      "use_components": [
        "button.jsx",
        "card.jsx",
        "form.jsx",
        "input.jsx",
        "label.jsx",
        "select.jsx",
        "calendar.jsx",
        "popover.jsx",
        "radio-group.jsx",
        "switch.jsx",
        "tabs.jsx",
        "table.jsx",
        "badge.jsx",
        "progress.jsx",
        "separator.jsx",
        "dialog.jsx",
        "sheet.jsx",
        "sonner.jsx",
        "skeleton.jsx",
        "pagination.jsx",
        "tooltip.jsx"
      ]
    },
    "booking_wizard_components": {
      "stepper_header": {
        "build": "Custom component using Progress + Breadcrumb (optional) + small step pills",
        "tailwind": "sticky top-0 z-30 backdrop-blur bg-background/80 border-b",
        "step_pill": "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs",
        "active": "bg-teal-100 text-foreground border-transparent",
        "completed": "bg-secondary",
        "data_testids": [
          "booking-stepper",
          "booking-stepper-current-step"
        ]
      },
      "step_card": {
        "use": "Card",
        "tailwind": "rounded-[var(--radius)] border bg-card shadow-sm",
        "header": "flex items-start justify-between gap-4",
        "data_testids": ["booking-step-card"]
      },
      "date_of_graduation": {
        "use": "Calendar + Popover (NOT native date input)",
        "pattern": "Button opens Popover with Calendar; selected date shown in button",
        "data_testids": ["graduation-date-picker", "graduation-date-calendar"]
      },
      "attendees_selector": {
        "use": "RadioGroup + Input",
        "pattern": "10 / 20 / More; if More selected show numeric input",
        "data_testids": ["attendees-radio", "attendees-custom-input"]
      },
      "food_toggle": {
        "use": "Switch",
        "copy": "Add food packs?",
        "data_testids": ["food-toggle-switch"]
      },
      "food_selection": {
        "use": "Tabs (Food / Drinks / Pastries) + Cards with Checkbox + quantity stepper",
        "quantity_stepper": "Use Button variants (ghost) with +/- and Input readOnly",
        "price_badge": "Badge variant=secondary with GHC",
        "data_testids": [
          "menu-tabs",
          "menu-item-card",
          "menu-item-quantity-increase",
          "menu-item-quantity-decrease"
        ]
      },
      "total_review": {
        "use": "Card + Table (line items) + Separator",
        "sticky_summary_mobile": "fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur px-4 py-3",
        "data_testids": ["booking-total-summary", "booking-total-amount"]
      },
      "payment_cta": {
        "use": "Button (primary) + Sonner toast for errors",
        "label": "Pay with Paystack",
        "data_testids": ["paystack-pay-button"]
      },
      "confirmation": {
        "use": "Card + Badge + Copy-to-clipboard button",
        "reservation_code": "Large monospace chip",
        "tailwind": "font-mono tracking-widest",
        "data_testids": ["reservation-code", "table-number", "copy-reservation-code"]
      }
    },
    "admin_components": {
      "admin_shell": {
        "use": "Sheet for mobile nav + Tabs for sections",
        "left_nav": "On md+ show fixed sidebar; on mobile open Sheet",
        "data_testids": ["admin-nav", "admin-mobile-nav-trigger"]
      },
      "kpi_cards": {
        "use": "Card + Badge",
        "kpis": ["Total bookings", "Paid", "Pending", "Total attendees", "Revenue (GHC)"],
        "data_testids": ["admin-kpi-total-bookings", "admin-kpi-revenue"]
      },
      "tables": {
        "use": "Table + Pagination + DropdownMenu for row actions",
        "status_badges": {
          "paid": "bg-teal-100 text-foreground",
          "pending": "bg-gold-100 text-foreground",
          "failed": "bg-red-100 text-red-700"
        },
        "data_testids": ["admin-bookings-table", "admin-payments-table"]
      },
      "products_management": {
        "use": "Dialog for add/edit product; Tabs for categories",
        "fields": "name, category, price (GHC), stock, vendor",
        "data_testids": ["admin-add-product-button", "admin-product-dialog"]
      },
      "tables_management": {
        "use": "Card grid for tables + Dialog assign booking",
        "visual": "Table cards show capacity + assigned reservation code",
        "data_testids": ["admin-table-card", "admin-assign-table-button"]
      }
    }
  },

  "buttons_and_inputs": {
    "button_style": {
      "primary": {
        "shape": "rounded-xl",
        "tailwind": "rounded-xl bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring",
        "motion": "hover: translateY(-1px) via shadow change; active: scale(0.98)",
        "no_transition_all": true
      },
      "secondary": {
        "tailwind": "rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 border",
        "use": "Back buttons, secondary actions"
      },
      "ghost": {
        "tailwind": "rounded-xl hover:bg-accent/30",
        "use": "Quantity stepper, table row actions"
      }
    },
    "input_style": {
      "tailwind": "rounded-xl bg-card border border-input focus-visible:ring-2 focus-visible:ring-ring",
      "helper_text": "Use small muted text under fields; show validation inline"
    },
    "form_validation": {
      "pattern": "Inline error under field + Sonner toast for payment failures",
      "data_testids": ["form-error-text"]
    }
  },

  "motion_and_microinteractions": {
    "library": {
      "recommended": "framer-motion",
      "install": "npm i framer-motion",
      "usage": [
        "Step transitions (slide/fade between wizard steps)",
        "KPI cards entrance on admin dashboard",
        "Success check animation on confirmation"
      ]
    },
    "principles": [
      "Use 120–180ms for hover transitions (colors/shadows only).",
      "Wizard step change: 220–280ms ease-out slide (x: 12px) + fade.",
      "Sticky bottom summary: animate in on first total calculation.",
      "Respect prefers-reduced-motion: disable transforms/entrances."
    ],
    "tailwind_examples": {
      "hover": "transition-colors duration-150",
      "card_hover": "transition-shadow duration-150 hover:shadow-md",
      "cta_press": "active:scale-[0.98]"
    }
  },

  "textures_and_decoration": {
    "grain_overlay": {
      "instructions": "Add a subtle CSS noise overlay to hero only (≤20% viewport).",
      "css_snippet": ".hero-noise::before{content:'';position:absolute;inset:0;background-image:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%222%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22120%22 height=%22120%22 filter=%22url(%23n)%22 opacity=%220.08%22/%3E%3C/svg%3E');mix-blend-mode:multiply;pointer-events:none;border-radius:inherit;}"
    },
    "kente_micro_pattern": {
      "usage": "Only as a thin divider bar or corner ribbon on hero card",
      "tailwind": "h-2 rounded-full bg-[linear-gradient(90deg,#0D9488_0%,#0D9488_18%,#D4A017_18%,#D4A017_36%,#C86B3C_36%,#C86B3C_54%,#0D9488_54%,#0D9488_72%,#D4A017_72%,#D4A017_100%)]"
    }
  },

  "data_visualization_admin": {
    "library": {
      "recommended": "recharts",
      "install": "npm i recharts",
      "charts": [
        "Revenue over time (line)",
        "Bookings by status (donut)",
        "Top food packs (bar)"
      ]
    },
    "empty_states": {
      "pattern": "Card with icon (lucide-react), short copy, and primary CTA",
      "data_testids": ["empty-state"]
    }
  },

  "accessibility": {
    "requirements": [
      "WCAG AA contrast: ink on cream; teal buttons with near-white text.",
      "Visible focus rings using --ring.",
      "Touch targets ≥ 44px (buttons, toggles).",
      "Use clear labels (avoid placeholders as labels).",
      "Provide WhatsApp/Phone input hint format (e.g., +233...)."
    ]
  },

  "image_urls": {
    "hero": [
      {
        "url": "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2Mzl8MHwxfHNlYXJjaHwyfHxncmFkdWF0aW9uJTIwY2VyZW1vbnklMjBjZWxlYnJhdGlvbnxlbnwwfHx8fDE3ODE1MDg1ODN8MA&ixlib=rb-4.1.0&q=85",
        "description": "Wide celebratory graduation moment (hats in the air). Use with a warm overlay + subtle noise.",
        "placement": "Landing hero right-side image or background image behind hero card (with overlay)."
      }
    ],
    "social_proof_or_gallery": [
      {
        "url": "https://images.unsplash.com/photo-1658235081452-c2ded30b8d9f?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2Mzl8MHwxfHNlYXJjaHw0fHxncmFkdWF0aW9uJTIwY2VyZW1vbnklMjBjZWxlYnJhdGlvbnxlbnwwfHx8fDE3ODE1MDg1ODN8MA&ixlib=rb-4.1.0&q=85",
        "description": "Group graduation photo for a small gallery strip.",
        "placement": "Landing page gallery / trust section."
      }
    ],
    "booking_success": [
      {
        "url": "https://images.unsplash.com/photo-1627556704290-2b1f5853ff78?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2Mzl8MHwxfHNlYXJjaHwxfHxncmFkdWF0aW9uJTIwY2VyZW1vbnklMjBjZWxlYnJhdGlvbnxlbnwwfHx8fDE3ODE1MDg1ODN8MA&ixlib=rb-4.1.0&q=85",
        "description": "Calm graduation scene for success page header.",
        "placement": "Payment success/confirmation page top banner (cropped)."
      }
    ]
  },

  "instructions_to_main_agent": {
    "global_css_changes": [
      "Remove CRA default centered dark header styles from App.css (do not center the whole app).",
      "Set body font to var(--font-body) and headings to var(--font-display).",
      "Replace shadcn :root HSL tokens with the provided teal/gold/cream system.",
      "Add hero-only gradient wash + noise overlay utility class; keep gradients under 20% viewport."
    ],
    "booking_flow_ux": [
      "Use a multi-step wizard with a sticky progress header and a sticky bottom total summary on mobile.",
      "Auto-calc totals in real time; show line items in review step.",
      "If Food toggle is OFF, skip menu steps and go straight to review/payment.",
      "Always show currency as GHC and format amounts consistently (e.g., GHC 120.00)."
    ],
    "admin_ux": [
      "Default landing in Admin: Overview with KPI cards + charts.",
      "Use Tabs for sections; keep filters above tables.",
      "Row actions via DropdownMenu; destructive actions require AlertDialog confirmation."
    ],
    "testing": [
      "Add data-testid to every input, button, step navigation control, totals, and admin table elements.",
      "Use kebab-case test ids describing role (not appearance)."
    ],
    "icons": {
      "library": "lucide-react",
      "usage": "Use icons for steps (Calendar, Users, Utensils, CreditCard, CheckCircle) and admin nav (LayoutDashboard, Package, Receipt, Table2)."
    }
  },

  "append_general_ui_ux_design_guidelines": "<General UI UX Design Guidelines>  \n    - You must **not** apply universal transition. Eg: `transition: all`. This results in breaking transforms. Always add transitions for specific interactive elements like button, input excluding transforms\n    - You must **not** center align the app container, ie do not add `.App { text-align: center; }` in the css file. This disrupts the human natural reading flow of text\n   - NEVER: use AI assistant Emoji characters like`🤖🧠💭💡🔮🎯📚🎭🎬🎪🎉🎊🎁🎀🎂🍰🎈🎨🎰💰💵💳🏦💎🪙💸🤑📊📈📉💹🔢🏆🥇 etc for icons. Always use **FontAwesome cdn** or **lucid-react** library already installed in the package.json\n\n **GRADIENT RESTRICTION RULE**\nNEVER use dark/saturated gradient combos (e.g., purple/pink) on any UI element.  Prohibited gradients: blue-500 to purple 600, purple 500 to pink-500, green-500 to blue-500, red to pink etc\nNEVER use dark gradients for logo, testimonial, footer etc\nNEVER let gradients cover more than 20% of the viewport.\nNEVER apply gradients to text-heavy content or reading areas.\nNEVER use gradients on small UI elements (<100px width).\nNEVER stack multiple gradient layers in the same viewport.\n\n**ENFORCEMENT RULE:**\n    • Id gradient area exceeds 20% of viewport OR affects readability, **THEN** use solid colors\n\n**How and where to use:**\n   • Section backgrounds (not content backgrounds)\n   • Hero section header content. Eg: dark to light to dark color\n   • Decorative overlays and accent elements only\n   • Hero section with 2-3 mild color\n   • Gradients creation can be done for any angle say horizontal, vertical or diagonal\n\n- For AI chat, voice application, **do not use purple color. Use color like light green, ocean blue, peach orange etc**\n\n</Font Guidelines>\n\n- Every interaction needs micro-animations - hover states, transitions, parallax effects, and entrance animations. Static = dead. \n   \n- Use 2-3x more spacing than feels comfortable. Cramped designs look cheap.\n\n- Subtle grain textures, noise overlays, custom cursors, selection states, and loading animations: separates good from extraordinary.\n   \n- Before generating UI, infer the visual style from the problem statement (palette, contrast, mood, motion) and immediately instantiate it by setting global design tokens (primary, secondary/accent, background, foreground, ring, state colors), rather than relying on any library defaults. Don't make the background dark as a default step, always understand problem first and define colors accordingly\n    Eg: - if it implies playful/energetic, choose a colorful scheme\n           - if it implies monochrome/minimal, choose a black–white/neutral scheme\n\n**Component Reuse:**\n\t- Prioritize using pre-existing components from src/components/ui when applicable\n\t- Create new components that match the style and conventions of existing components when needed\n\t- Examine existing components to understand the project's component patterns before creating new ones\n\n**IMPORTANT**: Do not use HTML based component like dropdown, calendar, toast etc. You **MUST** always use `/app/frontend/src/components/ui/ ` only as a primary components as these are modern and stylish component\n\n**Best Practices:**\n\t- Use Shadcn/UI as the primary component library for consistency and accessibility\n\t- Import path: ./components/[component-name]\n\n**Export Conventions:**\n\t- Components MUST use named exports (export const ComponentName = ...)\n\t- Pages MUST use default exports (export default function PageName() {...})\n\n**Toasts:**\n  - Use `sonner` for toasts\"\n  - Sonner component are located in `/app/src/components/ui/sonner.tsx`\n\nUse 2–4 color gradients, subtle textures/noise overlays, or CSS-based noise to avoid flat visuals.\n</General UI UX Design Guidelines>"
}
