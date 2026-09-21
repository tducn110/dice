import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const LANGUAGE_STORAGE_KEY = "13-dice-language";
type SupportedLanguage = "vi" | "en";
const isSupportedLanguage = (value: string | null): value is SupportedLanguage => value === "vi" || value === "en";
const getInitialLanguage = (): SupportedLanguage => {
  if (typeof window === "undefined") return "en";
  try {
    const value = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isSupportedLanguage(value) ? value : "en";
  } catch {
    return "en";
  }
};
const persistLanguage = (language: string): void => {
  const normalized = language.split("-")[0];
  if (typeof window === "undefined" || !isSupportedLanguage(normalized)) return;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
  } catch {
    /* Optional persistence. */
  }
};

export const formatNumber = (value: number, lang?: string): string => {
  const current = lang || i18n.resolvedLanguage || i18n.language || "en";
  return value.toLocaleString(current.startsWith("vi") ? "vi-VN" : "en-US");
};

const syncDocumentLang = (lang: string) => {
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.lang = lang;
  }
};

const resources = {
  vi: {
    translation: {
      common: {
        play: "Chơi",
        pause: "Tạm dừng",
        resume: "Tiếp tục",
        back: "Quay lại",
        close: "Đóng",
        retry: "Chơi lại",
      },
      settings: {
        title: "Cài đặt",
        language: "Ngôn ngữ",
        music: "Nhạc nền",
        sfx: "Hiệu ứng âm thanh",
        on: "Bật",
        off: "Tắt",
      },
      game: {
        total: "tổng",
        heat: "NHIỆT",
        streak: "CHUỖI x{{count}}",
        cold: "LẠNH -50%",
        coldWarn: "lạnh x{{count}}",
        diceCount: "{{count}} xúc xắc",
        autoRoll: "{{count}} tự động / {{interval}}s",
        prestige: "TRÙNG SINH",
        click: "NHẤN",
        jackpot: "ĐẠI THẮNG",
        heatBurst: "BÙNG NỔ NHIỆT",
        buyDie: "MUA XÚC XẮC",
        maxDice: "ĐÃ TỐI ĐA",
        tableHint: "NHẤN VÀO XÚC XẮC ĐỂ ĐỔ",
        maxed: "ĐÃ TỐI ĐA",
        max: "TỐI ĐA",
      },
      shop: {
        tabs: {
          ROLL: "ĐỔ",
          AUTO: "TỰ ĐỘNG",
          GUARD: "PHÒNG THỦ",
        },
        upgrades: {
          multiplier: "TĂNG GIÁ TRỊ",
          lucky: "MẶT MAY MẮN",
          crit: "CHÍ MẠNG",
          echo: "ĐỔ TIẾP VẬN",
          chain: "LIÊN KẾT CHUỖI",
          autoRoll: "TỰ ĐỘNG ĐỔ",
          rollSpeed: "TỐC ĐỘ ĐỔ",
          heat: "THANH NHIỆT",
          rarity: "TĂNG PHẨM CẤP",
          jackpotAmp: "KHUẾCH ĐẠI JACKPOT",
          lock: "KHÓA LIÊN HOÀN",
          ward: "HỘ MỆNH GIẢI NGUYỀN",
          polish: "ĐÁNH BÓNG XÚC XẮC",
          floor: "SÀN ĐIỂM TỐI THIỂU",
          heatBoost: "TĂNG TỐC NHIỆT",
        },
      },
    },
  },
  en: {
    translation: {
      common: {
        play: "Play",
        pause: "Pause",
        resume: "Resume",
        back: "Back",
        close: "Close",
        retry: "Play again",
      },
      settings: {
        title: "Settings",
        language: "Language",
        music: "Background music",
        sfx: "Sound effects",
        on: "On",
        off: "Off",
      },
      game: {
        total: "total",
        heat: "HEAT",
        streak: "STREAK x{{count}}",
        cold: "COLD -50%",
        coldWarn: "cold x{{count}}",
        diceCount: "{{count}} dice",
        autoRoll: "{{count}} auto / {{interval}}s",
        prestige: "PRESTIGE",
        click: "CLICK",
        jackpot: "JACKPOT",
        heatBurst: "HEAT BURST",
        buyDie: "BUY DIE",
        maxDice: "MAX DICE",
        tableHint: "CLICK A DIE TO ROLL IT",
        maxed: "MAXED",
        max: "MAX",
      },
      shop: {
        tabs: {
          ROLL: "ROLL",
          AUTO: "AUTO",
          GUARD: "GUARD",
        },
        upgrades: {
          multiplier: "VALUE BOOST",
          lucky: "LUCKY FACE",
          crit: "CRIT HIT",
          echo: "ECHO ROLL",
          chain: "CHAIN LINK",
          autoRoll: "AUTO ROLLER",
          rollSpeed: "ROLL SPEED",
          heat: "HEAT METER",
          rarity: "RARITY UP",
          jackpotAmp: "JACKPOT AMP",
          lock: "COMBO LOCK",
          ward: "CURSE WARD",
          polish: "DICE POLISH",
          floor: "VALUE FLOOR",
          heatBoost: "HEAT BOOST",
        },
      },
    },
  },
} as const;

void i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getInitialLanguage(),
    supportedLngs: ["en", "vi"],
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });
syncDocumentLang(i18n.language || "en");
i18n.on("languageChanged", (lng) => {
  persistLanguage(lng);
  syncDocumentLang(lng);
});

export default i18n;
