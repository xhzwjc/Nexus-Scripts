const fs = require('fs');
const filePath = 'e:/Python_project/project-root/my-app/src/components/Recruitment/RecruitmentAutomationContainer.tsx';
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

// Keep lines 1 to 3549 (0-indexed 0 to 3548)
const cleanLines = lines.slice(0, 3549);

// Add the final unified implementation
cleanLines.push(`    function renderAssistantConsole(mode: AssistantDisplayMode = "drawer") {
        return (
            <AssistantPage
                chatMessages={chatMessages}
                chatInput={chatInput}
                setChatInput={setChatInput}
                chatSending={chatSending}
                chatContext={chatContext}
                positions={positions}
                skills={skills}
                llmConfigs={llmConfigs}
                attachedFiles={attachedFiles as any}
                addAttachedFiles={addAttachedFiles}
                removeAttachedFile={(index) => {
                    const file = attachedFiles[index];
                    if (file) removeAttachedFile(file.id);
                }}
                activeChatTaskId={activeChatTaskId}
                isCurrentChatTaskCancelling={isCurrentChatTaskCancelling}
                assistantDisplayMode={mode}
                assistantOpen={assistantOpen}
                activePage={activePage}
                assistantScrollAreaRef={assistantScrollAreaRef}
                assistantScrollAnchorRef={assistantScrollAnchorRef}
                assistantInputRef={assistantInputRef}
                assistantModelLabel={assistantModelLabel}
                chatContextCandidateLabel={chatContextCandidateLabel}
                effectiveLLMConfigs={effectiveLLMConfigs}
                sendChatMessage={sendChatMessage}
                saveChatContext={saveChatContext}
                toggleSkillInAssistant={toggleSkillInAssistant}
                openAssistantMode={openAssistantMode}
                applyAssistantPrompt={applyAssistantPrompt}
                queueAssistantInputFocus={queueAssistantInputFocus}
                openTaskLogDetail={openTaskLogDetail}
                setActivePage={setActivePage}
            />
        );
    }

    function renderPage() {
        switch (activePage) {
            case "workspace":
                return (
                    <WorkspacePage
                        dashboard={dashboard}
                        todayNewResumes={todayNewResumes}
                        todoSummary={todoSummary}
                        recentCandidates={recentCandidates}
                        recentLogs={recentLogs}
                        panelClass={panelClass}
                        assistantOpen={assistantOpen}
                        setActivePage={setActivePage}
                        setSelectedCandidateId={setSelectedCandidateId}
                        setSelectedLogId={setSelectedLogId}
                        openAssistantMode={openAssistantMode}
                        openCreatePosition={openCreatePosition}
                        setResumeUploadOpen={setResumeUploadOpen}
                        renderAssistantConsole={renderAssistantConsole}
                        renderAssistantSuspendedState={() => null}
                        labelForCandidateStatus={labelForCandidateStatus}
                    />
                );
            case "positions":
                return (
                    <PositionsPage
                        panelClass={panelClass}
                        positionListCollapsed={positionListCollapsed}
                        setPositionListCollapsed={setPositionListCollapsed}
                        positions={positions}
                        positionsLoading={positionsLoading}
                        positionDetailLoading={positionDetailLoading}
                        positionDetail={positionDetail}
                        selectedPositionId={selectedPositionId}
                        setSelectedPositionId={setSelectedPositionId}
                        openCreatePosition={openCreatePosition}
                        openEditPosition={openEditPosition}
                        setPositionDeleteConfirmOpen={setPositionDeleteConfirmOpen}
                        setPublishDialogOpen={setPublishDialogOpen}
                        jdDraft={jdDraft}
                        setJdDraft={setJdDraft}
                        jdViewMode={jdViewMode}
                        setJdViewMode={setJdViewMode}
                        isJDGenerating={isJDGenerating}
                        jdGenerationStatus={jdGenerationStatus}
                        setJdGenerationStatus={setJdGenerationStatus}
                        latestJDGenerationError={latestJDGenerationError}
                        setJdGenerationError={setJdGenerationError}
                        jdExtraPrompt={jdExtraPrompt}
                        setJdExtraPrompt={setJdExtraPrompt}
                        currentJDVersion={currentJDVersion}
                        currentPreviewHtml={currentPreviewHtml}
                        currentPublishText={currentPublishText}
                        isJDDraftDirty={isJDDraftDirty}
                        currentPositionJDTaskId={currentPositionJDTaskId}
                        activeJDTaskId={activeJDTaskId}
                        setActiveJDTaskId={setActiveJDTaskId}
                        setActiveJDPositionId={setActiveJDPositionId}
                        triggerJDGeneration={triggerJDGeneration}
                        isTaskCancelling={isTaskCancelling}
                        positionDeleting={positionDeleting}
                    />
                );
            case "candidates":
                return (
                    <CandidatesPage
                        panelClass={panelClass}
                        candidates={candidates}
                        candidatesLoading={candidatesLoading}
                        candidateDetail={candidateDetail}
                        candidateDetailLoading={candidateDetailLoading}
                        selectedCandidateId={selectedCandidateId}
                        setSelectedCandidateId={setSelectedCandidateId}
                        loadCandidateDetail={loadCandidateDetail}
                        setResumeUploadOpen={setResumeUploadOpen}
                        setResumeMailDialogOpen={setResumeMailDialogOpen}
                        labelForCandidateStatus={labelForCandidateStatus}
                    />
                );
            case "audit":
                return (
                    <AuditPage
                        panelClass={panelClass}
                        aiLogs={recentLogs}
                        logsLoading={logsLoading}
                        selectedLogId={selectedLogId}
                        setSelectedLogId={setSelectedLogId}
                        loadLogs={loadLogs}
                    />
                );
            case "assistant":
                return renderAssistantConsole("page");
            case "settings":
                if (activeSettingsTab === "skills") {
                    return (
                        <SkillSettingsPage
                            panelClass={panelClass}
                            skills={skills}
                            skillsLoading={skillsLoading}
                            openSkillEditor={openSkillEditor}
                            deleteSkill={deleteSkill}
                            loadSkills={loadSkills}
                        />
                    );
                }
                if (activeSettingsTab === "models") {
                    return (
                        <ModelSettingsPage
                            panelClass={panelClass}
                            llmConfigs={llmConfigs}
                            modelsLoading={modelsLoading}
                            openLLMEditor={openLLMEditor}
                            deleteLLMConfig={deleteLLMConfig}
                            setPreferredLLMConfig={setPreferredLLMConfig}
                            loadLLMConfigs={loadLLMConfigs}
                        />
                    );
                }
                if (activeSettingsTab === "mail") {
                    return (
                        <MailSettingsPage
                            panelClass={panelClass}
                            mailSenderConfigs={mailSenderConfigs}
                            mailRecipients={mailRecipients}
                            mailSettingsLoading={mailSettingsLoading}
                            openMailSenderEditor={openMailSenderEditor}
                            openMailRecipientEditor={openMailRecipientEditor}
                            deleteMailSenderConfig={void 0 as any}
                            deleteMailRecipient={void 0 as any}
                            loadMailSettings={loadMailSettings}
                        />
                    );
                }
                return null;
            default:
                return null;
        }
    }

    async function addAttachedFiles(files: File[]) {
        const newFiles = files.map(file => ({
            id: Math.random().toString(36).substring(7),
            name: file.name,
            size: file.size,
            status: "ready"
        }));
        setAttachedFiles(current => [...current, ...newFiles]);
    }

    async function removeAttachedFile(fileId: string) {
        setAttachedFiles(current => current.filter(f => f.id !== fileId));
    }

    return (
        <div className="flex h-screen max-h-screen min-h-0 min-w-0 bg-[#F9FBFC] text-slate-900 dark:bg-[#020617] dark:text-slate-100">
            <div className={cn(
                "group relative flex flex-col border-r border-slate-200/80 bg-white pt-6 transition-[width] duration-300 dark:border-slate-800 dark:bg-slate-950",
                sidebarCollapsed ? "w-20" : "w-72"
            )}>
                <div className="flex items-center justify-between px-6 pb-6">
                    {!sidebarCollapsed && <h1 className="text-xl font-bold tracking-tight">AI 招聘中心</h1>}
                    <Button variant="ghost" size="icon" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="mx-auto">
                        <Rocket className="h-5 w-5" />
                    </Button>
                </div>
                <div className="flex-1 space-y-2 px-3 overflow-y-auto">
                    <SectionNavButton icon={LayoutDashboard} title="工作台" description="数据大屏" active={activePage === "workspace"} collapsed={sidebarCollapsed} onClick={() => setActivePage("workspace")} />
                    <SectionNavButton icon={Briefcase} title="岗位" description="JD 与流程" active={activePage === "positions"} count={positions.length} collapsed={sidebarCollapsed} onClick={() => setActivePage("positions")} />
                    <SectionNavButton icon={Users} title="候选人" description="人才库评估" active={activePage === "candidates"} count={candidates.length} collapsed={sidebarCollapsed} onClick={() => setActivePage("candidates")} />
                    <SectionNavButton icon={ShieldAlert} title="日志" description="AI 审计线索" active={activePage === "audit"} collapsed={sidebarCollapsed} onClick={() => setActivePage("audit")} />
                    <SectionNavButton icon={Settings2} title="设置" description="模型与 Skill" active={activePage === "settings"} collapsed={sidebarCollapsed} onClick={() => { setActivePage("settings"); setActiveSettingsTab("skills"); }} />
                </div>
            </div>

            <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="flex-1 min-h-0 overflow-auto bg-slate-50/50 dark:bg-slate-950/50">
                    {renderPage()}
                </div>
            </main>

            <Dialog open={resumeUploadOpen} onOpenChange={setResumeUploadOpen}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>上传简历</DialogTitle>
                        <DialogDescription>批量上传并关联岗位。</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button onClick={() => setResumeUploadOpen(false)}>关闭</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <SkillSettingsDialog open={skillDialogOpen} onOpenChange={setSkillDialogOpen} skill={skillEditingId ? skillMap.get(skillEditingId) || null : null} onSuccess={loadSkills} />
            <LLMSettingsDialog open={llmDialogOpen} onOpenChange={setLlmDialogOpen} config={llmEditingId ? llmConfigs.find(c => c.id === llmEditingId) || null : null} onSuccess={loadLLMConfigs} />
            <MailSenderSettingsDialog open={mailSenderDialogOpen} onOpenChange={setMailSenderDialogOpen} config={mailSenderEditingId ? mailSenderConfigs.find(c => c.id === mailSenderEditingId) || null : null} onSuccess={async () => { await loadMailSettings(); }} />
            <MailRecipientSettingsDialog open={mailRecipientDialogOpen} onOpenChange={setMailRecipientDialogOpen} recipient={mailRecipientEditingId ? mailRecipients.find(c => c.id === mailRecipientEditingId) || null : null} onSuccess={async () => { await loadMailSettings(); }} />
            
            <Dialog open={positionDeleteConfirmOpen} onOpenChange={setPositionDeleteConfirmOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>确认删除</DialogTitle></DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPositionDeleteConfirmOpen(false)}>取消</Button>
                        <Button variant="destructive" onClick={() => void deletePosition()}>确认删除</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
`);

fs.writeFileSync(filePath, cleanLines.join('\n'), 'utf-8');
console.log('Cleanup complete.');
