// i18n Type Definitions

export type Language = 'zh-CN' | 'en-US';

export interface Translations {
  // Common
  common: {
    loading: string;
    confirm: string;
    cancel: string;
    save: string;
    delete: string;
    edit: string;
    add: string;
    search: string;
    back: string;
    close: string;
    copy: string;
    copied: string;
    success: string;
    failed: string;
    error: string;
    warning: string;
    info: string;
    yes: string;
    no: string;
    ok: string;
    reset: string;
    clear: string;
    refresh: string;
    submit: string;
    unknownError: string;
    required: string;
  };

  // Auth / Login
  auth: {
    title: string;
    description: string;
    keyPlaceholder: string;
    loginButton: string;
    verifying: string;
    invalidKey: string;
    enterKey: string;
    verifySuccess: string;
  };

  // Lock Screen
  lock: {
    title: string;
    description: string;
    unlockPlaceholder: string;
    unlockButton: string;
    switchAccount: string;
    unlockSuccess: string;
    autoLockMessage: string;
    wrongKey: string;
    wrongAccount: string;
    emptyKey: string;
  };

  // Navigation & Layout
  nav: {
    home: string;
    cmTools: string;
    ocrTool: string;
    teamResources: string;
    aiResources: string;
    helpCenter: string;
    systemLogs: string;
    logout: string;
    workspace: string;
    support: string;
    account: string;
    systemRunning: string;
    serviceNormal: string;
    allNodesOnline: string;
  };

  // Header
  header: {
    searchPlaceholder: string;
    noResults: string;
    helpTitle: string;
    lockTitle: string;
    online: string;
  };

  // Home Page
  home: {
    greetingMorning: string;
    greetingNoon: string;
    greetingAfternoon: string;
    greetingEvening: string;
    greetingNight: string;
    systemNormal: string;
    availableResources: string;
    ready: string;
    systemHealth: string;
    stable: string;
    detecting: string;
    detectFailed: string;
    issues: string;
    totalExecuted: string;
    completed: string;
    cmSystem: {
      title: string;
      description: string;
      enterButton: string;
      running: string;
    };
    devTools: {
      title: string;
      description: string;
      enterButton: string;
      toolset: string;
    };
    hsSystem: {
      title: string;
      description: string;
      enterButton: string;
      planning: string;
    };
  };

  // System Page
  system: {
    scriptsCount: string;
    searchPlaceholder: string;
    searchHint: string;
    noScripts: string;
    launchScript: string;
  };

  // Quick Actions
  quickActions: {
    title: string;
    recentUsed: string;
    quickEntry: string;
    browseAll: string;
    devTools: string;
    ocrTool: string;
    helpDocs: string;
  };

  // Help Page
  help: {
    title: string;
    docList: string;
    openInNewWindow: string;
    selectDoc: string;
    backButton: string;
  };

  // Confirm Dialog
  dialog: {
    logoutTitle: string;
    logoutMessage: string;
  };

  // DevTools
  devTools: {
    title: string;
    subtitle: string;
    common: string;
    advanced: string;
    nav: {
      json: string;
      timestamp: string;
      uuid: string;
      base64: string;
      url: string;
      jwt: string;
      hash: string;
      regex: string;
      decrypt: string;
    };
    json: {
      title: string;
      desc: string;
      input: string;
      output: string;
      placeholder: string;
      clear: string;
      minify: string;
      format: string;
      copySuccess: string;
    };
    timestamp: {
      title: string;
      desc: string;
      label: string;
      placeholder: string;
      convert: string;
      beijingTime: string;
      nowLabel: string;
      getCurrent: string;
      invalid: string;
      datetimeLabel: string;
      datetimePlaceholder: string;
      toTimestamp: string;
      timestampResult: string;
      invalidDatetime: string;
      toDatetime: string;
      seconds: string;
      milliseconds: string;
    };
    uuid: {
      title: string;
      desc: string;
      generate: string;
      copySuccess: string;
    };
    base64: {
      title: string;
      desc: string;
      placeholder: string;
      encode: string;
      decode: string;
      resultPlaceholder: string;
      encodeFail: string;
      decodeFail: string;
      invalidBase64: string;
    };
    url: {
      title: string;
      inputPlaceholder: string;
      encode: string;
      decode: string;
      resultPlaceholder: string;
      error: string;
    };
    jwt: {
      title: string;
      desc: string;
      tokenLabel: string;
      tokenPlaceholder: string;
      headerLabel: string;
      payloadLabel: string;
      invalidFormat: string;
      parseFail: string;
    };
    hash: {
      title: string;
      desc: string;
      inputLabel: string;
      placeholder: string;
    };
    regex: {
      title: string;
      patternPlaceholder: string;
      flagsPlaceholder: string;
      testBtn: string;
      testStringLabel: string;
      testStringPlaceholder: string;
      matchesLabel: string;
      noMatches: string;
      error: string;
    };
    decrypt: {
      title: string;
      desc: string;
      inputLabel: string;
      inputPlaceholder: string;
      keyLabel: string;
      keyPlaceholder: string;
      decryptBtn: string;
      outputLabel: string;
      outputPlaceholder: string;
      success: string;
      fail: string;
      copySuccess: string;
      emptyInput: string;
      wrongKey: string;
    };

  };

  // Business Scripts
  scripts: {
    delivery: {
      title: string;
      multiUserMode: string;
      subTitleLogin: string;
      subTitleProcess: string;
      exitLogin: string;
      login: {
        title: string;
        desc: string;
        envLabel: string;
        mobileLabel: string;
        mobilePlaceholder: string;
        mobileHint: string;
        submitBtn: string;
        submitting: string;
      };
      process: {
        teamTitle: string;
        noTasks: string;
        refreshBtn: string;
        selectTask: string;
        statusRunning: string;
        noSelectTask: string;
        form: {
          title: string;
          titlePlaceholder: string;
          address: string;
          addressPlaceholder: string;
          desc: string;
          descPlaceholder: string;
          supplement: string;
          supplementPlaceholder: string;
          attachments: string;
          attachmentHint: string;
          supportedFormats: string;
          uploadImg: string;
          uploadFile: string;
          remove: string;
          uploadFailPrefix: string;
          submit: string;
          submitting: string;
        };
      };
      messages: {
        mobileInvalid: string;
        loginFailed: string;
        processError: string;
        loginSuccess: string;
        noLogin: string;
        refreshSuccess: string;
        fileSizeLimit: string;
        picLimit: string;
        fileLimit: string;
        uploadSuccess: string;
        uploadFailed: string;
        waitUpload: string;
        deleteFailed: string;
        pathFailed: string;
        submitSuccess: string;
        submitFailed: string;
        requestError: string;
        minAttachment: string;
        required: string;
      };
    };
    ocr: {
      title: string;
      subtitle: string;
      actions: {
        actionLabel: string;
        start: string;
        processing: string;
        abort: string;
        aborting: string;
        download: string;
      };
      status: {
        initializing: string;
        processing: string;
        remaining: string;
        waiting: string;
        completed: string;
        completedDesc: string;
        progressLabel: string;
      };
      form: {
        dataSource: string;
        dataSourceDesc: string;
        excelLabel: string;
        excelPlaceholder: string;
        excelHint: string;
        imagesLabel: string;
        imagesHint: string;
        selectedFiles: string;
        totalSize: string;
        folderPlaceholder: string;
        folderHint: string;
        largeFileWarning: string;
      };
      mode: {
        label: string;
        excelFirst: string;
        excelFirstDesc: string;
        imagesFirst: string;
        imagesFirstDesc: string;
      };
      dialog: {
        backTitle: string;
        backContent: string;
        backConfirm: string;
        abortTitle: string;
        abortContent: string;
        abortConfirm: string;
      };
      messages: {
        selectExcel: string;
        selectFolder: string;
      };
      logs: {
        startUpload: string;
        uploading: string;
        uploadComplete: string;
        aborted: string;
        aborting: string;
        failed: string;
        abortFailed: string;
      };
    };
  };

  // Language
  language: {
    zh: string;
    en: string;
    switchTo: string;
  };
}
