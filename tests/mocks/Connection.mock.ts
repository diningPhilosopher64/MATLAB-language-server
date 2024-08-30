import { _Connection, CancellationToken, CodeAction, CodeActionParams, CodeLens, CodeLensParams, ColorInformation, ColorPresentation, ColorPresentationParams, Command, CompletionItem, CompletionList, CompletionParams, Declaration, DeclarationLink, DeclarationParams, Definition, DefinitionLink, DefinitionParams, DidChangeConfigurationParams, DidChangeTextDocumentParams, DidChangeWatchedFilesParams, DidCloseTextDocumentParams, DidOpenTextDocumentParams, DidSaveTextDocumentParams, Disposable, DocumentColorParams, DocumentFormattingParams, DocumentHighlight, DocumentHighlightParams, DocumentLink, DocumentLinkParams, DocumentOnTypeFormattingParams, DocumentRangeFormattingParams, DocumentSymbol, DocumentSymbolParams, ExecuteCommandParams, FoldingRange, FoldingRangeParams, Hover, HoverParams, ImplementationParams, InitializedParams, InitializeError, InitializeParams, InitializeResult, Location, NotificationHandler, NotificationHandler0, PrepareRenameParams, ProgressType, ProtocolNotificationType0, ProtocolRequestType0, PublishDiagnosticsParams, Range, ReferenceParams, RemoteConsole, RenameParams, RequestHandler, RequestHandler0, SelectionRange, SelectionRangeParams, ServerRequestHandler, SignatureHelp, SignatureHelpParams, SymbolInformation, TextEdit, TypeDefinitionParams, WillSaveTextDocumentParams, WorkspaceEdit, WorkspaceSymbol, WorkspaceSymbolParams } from "vscode-languageserver";
import sinon from 'sinon'

export default function getMockConnection (): any {
    const mockConnection = {
        console: {
            connection: {},
            error: sinon.stub(),
            warn: sinon.stub(),
            info: sinon.stub(),
            log: sinon.stub()
        },
        sendNotification: sinon.stub()
    }

    return mockConnection
}
