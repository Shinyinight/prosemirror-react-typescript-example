import { action, computed, observable, makeObservable, runInAction } from 'mobx'

import { EditorStore } from './EditorStore'
import { ToastStore } from './ToastStore'
import { getDocuments, createDocument, updateDocument, deleteDocument } from '../document-api'

import {
  IDBDocument, PMDoc, uuidv4, EActionType, Action,
} from '@pm-react-example/shared'

interface IProps {
  editorStore: EditorStore
  toastStore: ToastStore
}

export class DocumentStore {

  @observable documentsMap: Map<string, IDBDocument> = new Map()
  @observable currentDocument: IDBDocument | null = null
  @observable unsyncedChanges: boolean = false
  STORAGE_KEY = 'full-editor-documents'

  editorStore: EditorStore
  toastStore: ToastStore

  constructor(props: IProps) {
    makeObservable(this)
    this.editorStore = props.editorStore
    this.toastStore = props.toastStore
    
    if (typeof window === 'undefined') return
    const existing = localStorage.getItem(this.STORAGE_KEY)
    if (existing && existing !== null && existing.length > 0) {
      // const parsed: [string, IDBDocument][] = JSON.parse(existing)
      // parsed.forEach(mapValue => {
      //   this.documentsMap.set(mapValue[0], {
      //     id: mapValue[0],
      //     doc: parseDoc(mapValue[1]),
      //   })
      // })
    }
  }

  @computed get documents(): IDBDocument[] {
    return Array.from(this.documentsMap.entries()).map(
      ([_id, doc]) => doc
    )
  }

  @action getDocuments = async () => {
    const { docs } = await getDocuments()
    // Synchronizes the added and deleted documents NOT the content
    // (this is done through the editor collab sync)
    runInAction(() => {
      const currentDocsIds = Array.from(this.documentsMap.entries()).map(([id, _doc]) => id)
      docs.forEach(d => {
        const idx = currentDocsIds.indexOf(d.id)
        if (idx === -1) {
          this.documentsMap.set(d.id, d)
        }
        currentDocsIds.splice(idx, 1)
      })
      // TODO use this to save the locally created documents?
      // return currentDocsIds
    })
  }

  @action setCurrentDocument = (id: string) => {
    // const { doc } = this.editorStore.getEditorState()
    // if (this.currentDocument) {
      // There might be unsaved changes as the debouncing takes a half sec after
      // user has stopped typing. Could probably set it to lower and just omit this 🤔
      // this.updateDocument(this.currentDocument.id, { ...this.currentDocument, doc })
    // }
    this.currentDocument = this.documentsMap.get(id) ?? null
    this.editorStore.setCurrentDoc(this.currentDocument?.doc)
  }

  @action createNewDocument = async (existingDoc?: PMDoc) => {
    const doc = existingDoc ?? this.editorStore.createEmptyDoc()
    const params = { title: 'Untitled', doc }
    let result
    try {
      result = await createDocument(params)
      // TODO not really
      this.unsyncedChanges = false
    } catch (err) {
    }
    // Incase the server is down or just not in use, create a local document
    // that hopefully will be synced to the server
    this.unsyncedChanges = true
    const id = result?.id ?? uuidv4()
    if (!result) {
      result = { id, ...params }
    }
    this.documentsMap.set(id, result)
    this.currentDocument = result
    this.editorStore.setCurrentDoc(doc)
    return result
  }

  @action updateDocument = async (id: string, doc: IDBDocument) => {
    try {
      await updateDocument(id, doc)
      // TODO not really how it works but a compromise for now
      this.unsyncedChanges = false
    } catch (err) {
      // TOOO: Should probably retry or something -> needs a robust event bus
      // Redux? oh god this gets so complicated
      // Probably with a websocket this becomes easier
      if (err.statusCode === 403) {
        runInAction(() => {
          this.toastStore.createToast(err?.message, 'danger')
          const oldDoc = this.documentsMap.get(id)
          this.editorStore.setCurrentDoc(oldDoc?.doc)
        })
        return
      }
      this.unsyncedChanges = true
    }
    // Either success or user/backend is offline
    runInAction(() => {
      this.documentsMap.set(id, doc)
    })
  }

  @action deleteDocument = async (id: string) => {
    try {
      await deleteDocument(id)
    } catch (err) {
      this.toastStore.createToast(err?.message, 'danger')
      return
    }
    runInAction(() => {
      this.documentsMap.delete(id)
      this.currentDocument = this.documents[0] ?? null
      const doc = this.currentDocument?.doc ?? this.editorStore.createEmptyDoc()
      this.editorStore.setCurrentDoc(doc)
    })
  }

  @action receiveUpdate = (action: Action, wasThisUser: boolean) => {
    if (wasThisUser) {
    } else if (action.type === EActionType.DOC_CREATE) {
      this.documentsMap.set(action.payload.doc.id, action.payload.doc)
      this.toastStore.createToast('Received document created')
    } else if (action.type === EActionType.DOC_DELETE) {
      this.documentsMap.delete(action.payload.documentId)
      this.toastStore.createToast('Received document deleted', 'danger')
    }
  }

  @action syncDocument = () => {
    const { doc } = this.editorStore.getEditorState()
    if (!this.currentDocument) {
      this.createNewDocument(doc)
    } else {
      this.updateDocument(this.currentDocument.id, { ...this.currentDocument, doc })
    }
  }

  @action reset = () => {
    this.documentsMap = new Map()
    this.currentDocument = null
  }
}