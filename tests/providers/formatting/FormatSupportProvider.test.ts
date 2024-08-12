import assert from 'assert'
import sinon from 'sinon'

import FormatSupportProvider from '../../../src/providers/formatting/FormatSupportProvider'
import MatlabLifecycleManager from '../../../src/lifecycle/MatlabLifecycleManager'
import ClientConnection from '../../../src/ClientConnection'

import { TextDocument } from 'vscode-languageserver-textdocument'
import { _Connection, DocumentFormattingParams, Range, TextDocuments, TextEdit } from 'vscode-languageserver'
import getMockConnection from '../../mocks/Connection.mock'

describe('FormatSupportProvider', () => {
    const matlabLifecycleManager = new MatlabLifecycleManager()
    const formatSupportProvider = new FormatSupportProvider(matlabLifecycleManager)
    const documentManager = new TextDocuments(TextDocument)

    let getMatlabConnectionStub: sinon.SinonStub

    let subscribeCallback: (message: unknown) => void
    let mockMatlabConnection = {
        getChannelId: () => '1',
        subscribe: (channel: string, callback: (message: unknown) => void) => { subscribeCallback = callback },
        publish: (channel: string, data: unknown) => {}
    }

    const mockTextDocument = TextDocument.create('mock/uri/file.m', 'matlab', 1, 'if true\nx = 3;\nend')

    before(() => {
        ClientConnection.setConnection(getMockConnection())
    })

    beforeEach(() => {
        const docManagerGetSpy = sinon.stub(documentManager, 'get')
        docManagerGetSpy.withArgs('mock/uri/file.m').returns(mockTextDocument)

        getMatlabConnectionStub = sinon.stub(matlabLifecycleManager, 'getMatlabConnection')
        getMatlabConnectionStub.returns(mockMatlabConnection)
    })

    afterEach(() => {
        sinon.reset()
        sinon.restore()
    })

    describe('#handleDocumentFormatRequest', () => {
        it('should return null if no document to format', async () => {
            const mockParams = {
                textDocument: {
                    uri: 'nonexistent/file.m' // URI should result in no document from the document manager
                },
                options: {}
            } as DocumentFormattingParams

            const res = await formatSupportProvider.handleDocumentFormatRequest(mockParams, documentManager)

            assert.equal(res, null, 'Result should be null')
        })

        it('should be no-op if connection is unavailable', async () => {
            const mockParams = {
                textDocument: {
                    uri: 'mock/uri/file.m'
                },
                options: {}
            } as DocumentFormattingParams

            // Set MatlabLifecycleManager mock to return no MATLAB connection
            getMatlabConnectionStub.returns(null)

            const res = await formatSupportProvider.handleDocumentFormatRequest(mockParams, documentManager)
            assert.deepEqual(res, [], 'Result should be empty array')
        })

        it('should return edit for document format', async (done) => {
            const mockParams = {
                textDocument: {
                    uri: 'mock/uri/file.m'
                },
                options: {
                    insertSpaces: true,
                    tabSize: 5
                }
            } as DocumentFormattingParams
            
            const mockResponseFromMatlab = {
                data: 'if true\n    x = 3;\nend'
            }

            const publishStub = sinon.stub(mockMatlabConnection, 'publish')

            formatSupportProvider.handleDocumentFormatRequest(mockParams, documentManager).then(res => {
                // Assert that a correct TextEdit is resolved
                const expectedResult = TextEdit.replace(Range.create(0, 0, 2, 3), mockResponseFromMatlab.data)
                assert.deepEqual(res, expectedResult)
                done()
            })

            // Assert that the correct data was sent to MATLAB
            assert.ok(publishStub.calledOnce, '`publish` should have been called')
            const requestData = publishStub.args[0][1]
            const expectedRequestData = {
                data: mockTextDocument.getText(),
                insertSpaces: mockParams.options.insertSpaces,
                tabSize: mockParams.options.tabSize,
                channelId: mockMatlabConnection.getChannelId()
            }
            assert.deepEqual(requestData, expectedRequestData)

            // Call the callback with the mock response from MATLAB
            subscribeCallback(mockResponseFromMatlab)
        })
    })
})
