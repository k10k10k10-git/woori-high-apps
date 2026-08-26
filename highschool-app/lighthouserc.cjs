module.exports = {
  ci: {
    collect: {
      startServerCommand: "npm start",
      startServerReadyPattern: "Ready|started server",
      url: ["http://localhost:3000/"],
      numberOfRuns: 1,
      settings: {
        preset: "desktop",
        chromeFlags: "--no-sandbox --headless",
      },
    },
    assert: {
      assertions: {
        "first-contentful-paint": ["error", { maxNumericValue: 1800 }],
        "speed-index": ["error", { maxNumericValue: 3000 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "categories:best-practices": ["error", { minScore: 0.85 }],
        "categories:seo": ["warn", { minScore: 0.8 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: ".lighthouseci",
    },
  },
};
