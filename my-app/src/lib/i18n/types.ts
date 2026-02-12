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
    prev: string;
    next: string;
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
    notSelected: string;
    pagination: {
      prefix: string;
      suffix: string;
      separator: string;
    };
  };

  serverMonitoring: {
    title: string;
    back: string;
    // Status
    live: string;
    offline: string; // Added just in case
    // Actions
    pause: string;
    resume: string;
    refresh: string;
    interval: string;
    // Metrics Labels
    cpuLoad: string;
    coresActive: string;
    memory: string;
    netInOut: string;
    sysLoad: string;
    cpuHistory: string;
    memTrend: string;
    coreMap: string;
    diskUsage: string;
    sysInfo: string;
    // Data Labels
    total: string;
    idle: string;
    active: string;
    heavy: string;
    lowSpace: string;
    used: string;
    hostname: string;
    os: string;
    kernel: string;
    uptime: string;
    server: string;
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
    opsCenter: string;
  };

  // Header
  header: {
    searchPlaceholder: string;
    noResults: string;
    helpTitle: string;
    lockTitle: string;
    online: string;
    organization: string;
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
      running: string;
      enterButton: string;
    };
    hsSystem: {
      title: string;
      description: string;
      planning: string;
      enterButton: string;
    };
    search: {
      cm: {
        name: string;
        desc: string;
      };
      hs: {
        name: string;
        desc: string;
      };
      ops: {
        name: string;
        desc: string;
      };
    };
    devTools: {
      title: string;
      toolset: string;
      description: string;
      enterButton: string;
      planning: string;
    };
  };

  // Scripts config (names and descriptions for systems and scripts)
  scriptConfig: {
    systems: {
      chunmiao: {
        name: string;
        description: string;
      };
      haoshi: {
        name: string;
        description: string;
      };
    };
    items: {
      settlement: { name: string; description: string; };
      commission: { name: string; description: string; };
      balance: { name: string; description: string; };
      taskAutomation: { name: string; description: string; };
      smsOperationsCenter: { name: string; description: string; };
      taxReporting: { name: string; description: string; };
      taxCalculation: { name: string; description: string; };
      paymentStats: { name: string; description: string; };
      deliveryTool: { name: string; description: string; };
      serverMonitoring: { name: string; description: string; };
    };
  };

  // Time Chip
  timeChip: {
    greetings: {
      night: string;
      morning: string;
      noon: string;
      afternoon: string;
      evening: string;
    };
  };

  // Weather Chip
  weatherChip: {
    defaultCity: string;
    loading: string;
    unavailable: string;
    refreshing: string;
    refreshWeather: string;
  };

  // Team Resources
  teamResources: {
    loading: string;
    back: string;
    saveSuccess: string;
    saveFail: string;
    sessionTimeout: string;
    // ResourceLock
    title: string;
    lockDescription: string;
    keyPlaceholder: string;
    verifying: string;
    unlock: string;
    verifySuccess: string;
    invalidKey: string;
    // ResourceViewer
    viewerTitle: string;
    searchPlaceholder: string;
    healthCheck: string;
    manageResources: string;
    lock: string;
    systems: string;
    searchResults: string;
    manageDescription: string;
    noSystems: string;
    noSystemsInGroup: string;
    addSystem: string;
    // Envs
    envDev: string;
    envTest: string;
    envProd: string;
    // SystemCard
    noDescription: string;
    noCredentials: string;
    envNotConfigured: string;
    contentEmpty: string;
    copiedLabel: string;
    username: string;
    password: string;
    notSet: string;
    // HealthCheckPanel
    healthCheckTitle: string;
    healthCheckDesc: string;
    systemsCount: string;
    envsToCheck: string;
    startCheck: string;
    checking: string;
    progressLabel: string;
    clickToStart: string;
    needAttention: string;
    needFocus: string;
    statusNormal: string;
    statusWarning: string;
    statusDanger: string;
    statusUnknown: string;
    accessible: string;
    inaccessible: string;
    expired: string;
    expiresIn: string;
    daysRemaining: string;
    clearedEnv: string;
    // ResourceEditor
    resourceManage: string;
    cancel: string;
    saving: string;
    saveChanges: string;
    groupList: string;
    systemList: string;
    groupName: string;
    logoOptional: string;
    clickToUpload: string;
    logoUploaded: string;
    imageTooLarge: string;
    noSystemsAddHint: string;
    selectSystemToEdit: string;
    systemName: string;
    descriptionLabel: string;
    optional: string;
    newGroup: string;
    newSystem: string;
    newAccount: string;
    keepOneGroup: string;
    devEnv: string;
    testEnv: string;
    prodEnv: string;
    accessUrl: string;
    credentialList: string;
    addCredential: string;
    labelPlaceholder: string;
    usernamePlaceholder: string;
    passwordOptional: string;
    noCredentialsYet: string;
    clearThisEnv: string;
    skipHealthCheck: string;
    skipCertCheck: string;
    // Export
    exportResources: string;
    exportFileName: string;
    exportHeader: string;
    exportGeneratedAt: string;
    exportGroup: string;
    exportSystem: string;
    exportDescription: string;
    exportCredentials: string;
    exportSuccess: string;
  };

  // Header Health Indicator
  headerHealth: {
    checking: string;
    checkFailed: string;
    retryTooltip: string;
    issues: string;
    certIssues: string;
    recheck: string;
    inaccessible: string;
    expired: string;
    days: string;
    allHealthy: string;
    statusTitle: string;
    allSystemsNormal: string;
    envsChecked: string;
  };

  // AI Resources
  aiResources: {
    title: string;
    back: string;
    searchPlaceholder: string;
    allCategory: string;
    noResults: string;
    downloadIcons: string;
    manage: string;
    saveSuccess: string;
    saveFail: string;
    allIconsExist: string;
    downloadComplete: string;
    // AIResourceEditor
    manageTitle: string;
    cancel: string;
    save: string;
    deleteIcons: string;
    resourcesTab: string;
    categoriesTab: string;
    addResource: string;
    allCategories: string;
    name: string;
    description: string;
    category: string;
    url: string;
    actions: string;
    noResourcesFound: string;
    categoryList: string;
    addCategory: string;
    icon: string;
    order: string;
    resourceCount: string;
    confirmDeleteResource: string;
    confirmDeleteCategory: string;
    categoryHasResources: string;
    deletedIcons: string;
    // Resource modal
    addResourceTitle: string;
    editResourceTitle: string;
    nameRequired: string;
    namePlaceholder: string;
    descriptionPlaceholder: string;
    urlRequired: string;
    urlPlaceholder: string;
    iconLabel: string;
    iconSavePath: string;
    iconUploadSuccess: string;
    uploadFailed: string;
    tagsLabel: string;
    tagsPlaceholder: string;
    orderLabel: string;
    nameOrUrlEmpty: string;
    // Category modal
    addCategoryTitle: string;
    editCategoryTitle: string;
    categoryNamePlaceholder: string;
    categoryNameEmpty: string;
    deleteIcon: string;
    undoDelete: string;
    selectImage: string;
  };

  // System Page
  system: {
    scriptsCount: string;
    searchPlaceholder: string;
    searchHint: string;
    noScripts: string;
    launchScript: string;
  };

  // Help Page
  helpPage: {
    title: string;
    listTitle: string;
    selectDocPlaceholder: string;
    openInNewWindow: string;
    docs: {
      sigGuide: string;
      ocrGuide: string;
    };
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
        brandFeature1: string;
        brandFeature2: string;
        brandFeature3: string;
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
          imageHint: string;
          fileHint: string;
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
        processError: string;
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
        cancel: string; // Add cancel here if it's missing in type definition but used
      };
      status: {
        initializing: string;
        processing: string;
        completed: string;
        completedDesc: string;
        remaining: string;
        waiting: string;
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
        folderPlaceholder: string;
        folderHint: string;
        selectedFiles: string;
        totalSize: string;
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
        success: string;
        fail: string;
      };
      logs: {
        startUpload: string;
        uploading: string;
        uploadComplete: string;
        aborted: string;
        failed: string;
        aborting: string;
      };
    };
    settlement: {
      title: string;
      subtitle: string;
      back: string;
      status: {
        running: string;
        ready: string;
      };
      mode: {
        concurrent: string;
        sequential: string;
        label: string;
      };
      environment: {
        label: string;
        prod: string;
        beta: string;
      };
      config: {
        title: string;
        executionMode: string;
        selectMode: string;
        modes: {
          settlement: string;
          reissue: string;
          single: string;
        };
        concurrency: string;
        concurrencyPlaceholder: string;
        concurrencyHint: string;
        interval: string;
        intervalHint: string;
      };
      enterprise: {
        title: string;
        add: string;
        empty: string;
        emptyHint: string;
        item: string;
        remove: string;
        name: string;
        namePlaceholder: string;
        token: string;
        tokenPlaceholder: string;
        tenantId: string;
        tenantIdPlaceholder: string;
        taxId: string;
        taxIdPlaceholder: string;
        items1: string;
        items1Placeholder: string;
        items2: string;
        items2Placeholder: string;
        items3: string;
        items3Placeholder: string;
        items3Hint: string;
      };
      actions: {
        processing: string;
        stop: string;
        start: string;
        copyLogs: string;
        clearLogs: string;
      };
      logs: {
        title: string;
        waiting: string;
        copySuccess: string;
        copyFail: string;
        start: string;
        stopRequest: string;
        stopSuccess: string;
        abort: string;
        aborted: string;
        success: string;
        error: string;
        finished: string;
        unknownError: string;
      };
      messages: {
        selectMode: string;
        addEnterprise: string;
        incompleteInfo: string;
        missingItems1: string;
        missingItems2: string;
        missingItems3: string;
        invalidItems3: string;
        start: string;
        confirmBack: string;
        execSuccess: string;
      };
    };
    commission: {
      title: string;
      subtitle: string;
      back: string;
      status: {
        running: string;
        ready: string;
        apiMismatch: string;
      };
      params: {
        title: string;
        env: string;
        envPlaceholder: string;
        channelId: string;
        channelIdPlaceholder: string;
        start: string;
        loading: string;
      };
      logs: {
        title: string;
        waiting: string;
        autoFollow: string;
        paused: string;
        bottom: string;
        clear: string;
        start: string;
        success: string;
        error: string;
      };
      messages: {
        selectEnvAndChannelId: string;
        execSuccess: string;
      };
      kpi: {
        title: string;
        totalProfit: string;
        monthCommission: string;
        dailyCommission: string;
        profitStatus: string;
        totalPay: string;
        dailyPay: string;
        totalCount: string;
        matchRate: string;
        profitable: string;
        loss: string;
        countSuffix: string;
      };
      taxAnalysis: {
        title: string;
        searchPlaceholder: string;
        onlyMismatch: string;
        pageSize: string;
        empty: string;
        noData: string;
        totalPages: string;
        totalItems: string;
        prev: string;
        next: string;
      };
      table: {
        taxName: string;
        actualPay: string;
        payAmount: string;
        serviceFee: string;
        channelFee: string;
        apiCommission: string;
        difference: string;
        channelProfit: string;
        batchNo: string;
        settlementNo: string;
        month: string;
        history: string;
        actions: string;
        detail: string;
      };
      dialog: {
        title: string;
        copy: string;
        copySuccess: string;
        copyFail: string;
        fields: {
          taxName: string;
          taxId: string;
          entName: string;
          entId: string;
          actualPay: string;
          payAmount: string;
          serverFee: string;
          channelFee: string;
          apiCommission: string;
          difference: string;
          allowance: string;
          rawFee: string;
          channelProfit: string;
          rawProfit: string;
          batchNo: string;
          settlementNo: string;
          rateConfig: string;
          rateDetail: string;
          history: string;
          payTime: string;
          month: string;
          verifyStatus: string;
          matched: string;
          mismatched: string;
        };
      };
      enterpriseAnalysis: {
        title: string;
        empty: string;
        info: string;
        fields: {
          name: string;
          id: string;
          totalPay: string;
          totalCommission: string;
          totalCount: string;
          totalRecharge: string;
        };
        table: {
          month: string;
          monthPay: string;
          monthCommission: string;
          monthCount: string;
          monthRecharge: string;
        };
      };
    };
    balance: {
      title: string;
      subtitle: string;
      back: string;
      status: {
        querying: string;
        ready: string;
      };
      tabs: {
        single: string;
        batch: string;
      };
      actions: {
        startBatch: string;
      };
      params: {
        title: string;
        env: string;
        envPlaceholder: string;
        envProd: string;
        envTest: string;
        label: string;
        searchPlaceholder: string;
        query: string;
        querying: string;
        reset: string;
        export: string;
      };
      kpi: {
        queryCount: string;
        totalTax: string;
        errorTax: string;
        normalTax: string;
      };
      table: {
        title: string;
        pageSize: string;
        total: string;
        taxId: string;
        taxAddress: string;
        entName: string;
        deductions: string;
        recharges: string;
        refunds: string;
        expected: string;
        actual: string;
        diff: string;
        result: string;
        noDiff: string;
        correct: string;
        abnormal: string;
      };
      messages: {
        inputValidId: string;
        noData: string;
        success: string;
        verifySuccess: string;
        fail: string;
        reset: string;
        file: string;
        listFail: string;
        listUpdate: string;
      };
      empty: {
        noData: string;
        ready: string;
        instruction: string;
      };
    };
    taskAutomation: {
      title: string;
      subtitle: string;
      back: string;
      tabs: {
        upload: string;
        mode: string;
        task: string;
        results: string;
      };
      upload: {
        title: string;
        label: string;
        dragDrop: string;
        dragDropHint: string;
        supportTxt: string;
        manualTitle: string;
        manualLabel: string;
        manualPlaceholder: string;
        submitBtn: string;
        startLine: string;
        endLine: string;
        startPlaceholder: string;
        endPlaceholder: string;
        fetchBtn: string;
        fetching: string;
        clear: string;
        fileSelected: string;
      };
      mode: {
        title: string;
        label: string;
        placeholder: string;
        options: {
          full: string;
          loginSign: string;
          loginDelivery: string;
          loginBalance: string;
        };
        desc: {
          full: string;
          loginSign: string;
          loginDelivery: string;
          loginBalance: string;
        };
      };
      execution: {
        envLabel: string;
        envPlaceholder: string;
        typeLabel: string;
        typePlaceholder: string;
        sequential: string;
        concurrent: string;
        concurrencyLabel: string;
        next: string;
      };
      task: {
        title: string;
        idLabel: string;
        idPlaceholder: string;
        start: string;
        running: string;
        status: string;
        ready: string;
        executing: string;
      };
      table: {
        phone: string;
        status: string;
        result: string;
        pending: string;
        success: string;
        failed: string;
      };
      messages: {
        fileRequired: string;
        invalidRange: string;
        parseSuccess: string;
        processSuccess: string;
        parseFail: string;
        inputValidPhone: string;
        taskInfoRequired: string;
        success: string;
        fail: string;
        download: string;
      };
    };
    batchSms: {
      title: string;
      subtitle: string;
      status: {
        sending: string;
        resending: string;
        loading: string;
        ready: string;
        processing: string;
      };
      tabs: {
        template: string;
        single: string;
        batch: string;
        resend: string;
        logs: string;
      };
      login: {
        button: string;
        loggedIn: string;
        title: string;
        description: string;
        secretLabel: string;
        secretPlaceholder: string;
        cancel: string;
        submit: string;
        envTest: string;
        envProd: string;
        toast: {
          invalidKey: string;
          apiMissing: string;
          success: string;
          fail: string;
          error: string;
          errorRequest: string;
          loginRequired: string;
        };
      };
      template: {
        configTitle: string;
        envLabel: string;
        envPlaceholder: string;
        envTest: string;
        envProd: string;
        timeoutLabel: string;
        fetchAll: string;
        fetchAllowed: string;
        viewCode: string;
        hideCode: string;
        updateConfig: string;
        listTitle: string;
        searchPlaceholder: string;
        empty: string;
        table: {
          code: string;
          name: string;
          status: string;
          allowed: string;
          restricted: string;
        };
        codeFormatTitle: string;
        copy: string;
        copied: string;
        copyHint: string;
      };
      single: {
        title: string;
        selectTemplate: string;
        selectPlaceholder: string;
        refresh: string;
        usePreset: string;
        paramsTitle: string;
        paramHint: string;
        noParams: string;
        addParam: string;
        paramName: string;
        paramValue: string;
        mobileList: string;
        mobilePlaceholder: string;
        mobileHint: string;
        send: string;
      };
      batch: {
        title: string;
        templateList: string;
        searchAllowed: string;
        noAllowed: string;
        selectAll: string;
        clearSelection: string;
        randomSend: string;
        randomHint: string;
        send: string;
        mobileList: string;
        mobilePlaceholder: string;
        usePreset: string;
      };
      resend: {
        title: string;
        typeLabel: string;
        mobileType: string;
        batchType: string;
        mobileLabel: string;
        mobilePlaceholder: string;
        mobileHint: string;
        taxIdLabel: string;
        taxIdPlaceholder: string;
        taxIdHint: string;
        batchNoLabel: string;
        batchNoPlaceholder: string;
        batchNoHint: string;
        requestId: string;
        submit: string;
        resultTitle: string;
        details: string;
      };
      results: {
        title: string;
        export: string;
        total: string;
        success: string;
        failure: string;
        table: {
          mobile: string;
          template: string;
          result: string;
          detail: string;
          view: string;
          hide: string;
        };
      };
      messages: {
        fetchSuccess: string;
        fetchFail: string;
        updateSuccess: string;
        updateFail: string;
        copySuccess: string;
        copyFail: string;
        mobileParse: string;
        mobileInvalid: string;
        selectTemplate: string;
        inputMobile: string;
        noValidMobile: string;
        sendSuccess: string;
        sendFail: string;
        resendSuccess: string;
        resendFail: string;
        noResult: string;
      };
      logs: {
        title: string;
        refresh: string;
        query: string;
        reset: string;
        export: string;
        filters: {
          mobile: string;
          mobilePlaceholder: string;
          sendStatus: string;
          receiveStatus: string;
          templateType: string;
          templateId: string;
          sendTime: string;
          all: string;
          success: string;
          failed: string;
          pending: string;
          types: {
            verification: string;
            notification: string;
            marketing: string;
          }
        };
        table: {
          id: string;
          mobile: string;
          templateCode: string;
          templateType: string;
          content: string;
          sendStatus: string;
          receiveStatus: string;
          sendTime: string;
          empty: string;
          unknown: string;
          success: string;
          failed: string;
          waiting: string;
          types: {
            verification: string;
            notification: string;
            marketing: string;
          }
        };
        pagination: {
          total: string;
          prev: string;
          next: string;
          page: string;
          size: string;
        }; toast: {
          refreshSuccess: string;
          fetchFail: string;
          fetchFailMsg: string;
        };
      };
    };
    taxReport: {
      title: string;
      back: string;
      environment: {
        label: string;
        placeholder: string;
        prod: string;
        test: string;
      };
      tabs: {
        query: string;
        generate: string;
      };
      query: {
        title: string;
        description: string;
        yearMonth: string;
        amountType: {
          label: string;
          placeholder: string;
          payAmount: string;
          payAmountDesc: string;
          workerPayAmount: string;
          workerPayAmountDesc: string;
          billAmount: string;
          billAmountDesc: string;
        };
        fetch: string;
        fetching: string;
        enterprise: {
          label: string;
          selectAll: string;
          deselectAll: string;
          loading: string;
          empty: string;
          status: string;
          id: string;
        };
      };
      list: {
        title: string;
        resultSuffix: string;
        serviceFeeStatus: {
          label: string;
          all: string;
          success: string;
          failed: string;
        };
        totalAmount: string;
        amountBreakdown: string;
        summary: string;
        rowsPerPage: string;
      };
      table: {
        index: string;
        name: string;
        idCard: string;
        enterprise: string;
        taxLand: string;
        turnover: string;
        tax: string;
        serviceFeeStatus: string;
        taxStatus: string;
        noTaxRequired: string;
        noData: string;
      };
      dialog: {
        title: string;
        content: string;
        cancel: string;
        confirm: string;
        generating: string;
      };
      messages: {
        enterpriseUpdateSuccess: string;
        enterpriseUpdateFail: string;
        enterpriseError: string;
        yearMonthRequired: string;
        fetchSuccess: string;
        fetchFail: string;
        fetchError: string;
        noDataForReport: string;
        generating: string;
        generateSuccess: string;
        generateError: string;
        requestError: string;
        enterpriseErrorLog: string;
        fetchErrorLog: string;
        generateErrorLog: string;
      };
      generate: {
        title: string;
        description: string;
        yearMonth: string;
        amountType: string;
        amountTypePlaceholder: string;
        amountTypes: {
          payAmount: string;
          payAmountDesc: string;
          workerPayAmount: string;
          workerPayAmountDesc: string;
          billAmount: string;
          billAmountDesc: string;
        };
        platformCompany: string;
        platformCompanyPlaceholder: string;
        creditCode: string;
        creditCodePlaceholder: string;
        preview: {
          title: string;
          yearMonth: string;
          enterprise: string;
          selected: string;
          noSelection: string;
          id: string;
          remove: string;
          clear: string;
        };
        download: string;
        instructions: {
          title: string;
          items: {
            time: string;
            location: string;
            history: string;
            sheets: string;
          };
        };
      };
    };
    taxCalculator: {
      title: string;
      description: string;
      status: {
        calculating: string;
        ready: string;
      };
      config: {
        title: string;
        description: string;
        useMock: string;
        batchNo: string;
        batchNoPlaceholder: string;
        taxId: string;
        taxIdPlaceholder: string;
        realName: string;
        realNamePlaceholder: string;
        incomeType: string;
        incomeTypePlaceholder: string;
        incomeTypes: {
          labor: string;
          salary: string;
        };
        year: string;
        yearPlaceholder: string;
        yearHint: string;
        deduction: string;
        deductionPlaceholder: string;
        env: string;
        envPlaceholder: string;
        envs: {
          test: string;
          prod: string;
          local: string;
        };
      };
      mock: {
        title: string;
        batchAmountPlaceholder: string;
        applyAll: string;
        addRecord: string;
        billAmount: string;
      };
      actions: {
        reset: string;
        calculate: string;
        view: string;
        rowsPerPage: string;
        jump: string;
        close: string;
        noResult: string;
        page: string;
        back: string;
      };
      results: {
        title: string;
        export: string;
        total: string;
        messages: {
          limit12: string;
          invalidAmount: string;
          invalidId: string;
          ruleError: string;
          noMock: string;
          invalidDate: string;
          noMatch: string;
          success: string;
          fail: string;
          error: string;
          pageRange: string;
        };
        table: {
          yearMonth: string;
          deduction: string;
          specialDeduction: string;
          preTaxIncome: string;
          taxableIncome: string;
          accumulatedTax: string;
          taxRate: string;
          preTax: string;
          afterTax: string;
          monthlyTax: string;
          actualBurden: string;
          name: string;
          totalTax: string;
        };
        fileName: string;
      };
    };
    paymentStats: {
      title: string;
      back: string;
      config: {
        title: string;
        env: string;
        envTest: string;
        envProd: string;
        filter: string;
        selected: string;
        placeholder: string;
        search: string;
        empty: string;
        selectAll: string;
        testEnterprise: string;
        excludeHint: string;
        calculate: string;
        calculating: string;
      };
      kpi: {
        totalSettlement: string;
        taxCount: string;
        basedOn: string;
        totalService: string;
        serviceDesc: string;
        totalTax: string;
      };
      charts: {
        monthlyTitle: string;
        noData: string;
        records: string;
        serviceFee: string;
        taxAmount: string;
        table: {
          enterprise: string;
          tax: string;
          amount: string;
          service: string;
          taxAmount: string;
        };
      };
      tables: {
        tax: {
          title: string;
          subtitle: string;
        };
        enterprise: {
          title: string;
          subtitle: string;
        };
        headers: {
          taxName: string;
          entName: string;
          uninvoiced: string;
          invoiced: string;
          ratio: string;
          total: string;
        };
        empty: {
          instruction: string;
          noData: string;
        };
      };
      messages: {
        fetchFail: string;
        selectRequired: string;
        calcSuccess: string;
        calcFail: string;
      };
    };
  };


  // Language
  language: {
    zh: string;
    en: string;
    switchTo: string;
  };

  // Theme
  theme: {
    light: string;
    dark: string;
    system: string;
    toggle: string;
  };
}
