import { Request, Response, NextFunction } from 'express'
import { Step } from 'prosemirror-transform'
import { ParsedQs } from 'qs'

import { docService } from './document.svc'
import { CustomError } from '../../common/error'

import { PatchedStep } from '../../types/document'
import { IRequest } from '../../types/request'
import { CollaborativeInstance } from './CollaborativeInstance'
import {
  IGetDocumentsResponse, IGetDocumentResponse, ISaveCollabStepsParams, INewStepsResponse
} from '@pm-react-example/shared'

interface IGetDocEventsQueryParams {
  version: number
}
interface ISaveDocParams {
  clientID: number
  version: number
  steps: Step[]
}

function reqIP(req: Request) : string {
  if (req.headers['x-forwarded-for']) {
    return req.headers['x-forwarded-for'][0]
  }
  return req.socket.remoteAddress
}

function parseQueryParam(param: undefined | string | string[] | ParsedQs | ParsedQs[]) : string {
  if (typeof param === 'object') {
    throw new CustomError(`Object as query param: ${param}`)
  } else if (param === null || param === undefined) {
    throw new CustomError(`Null or undefined query param: ${param}`)
  }
  return param
}

function createNewStepsResponse(inst: CollaborativeInstance, data: {
  steps: PatchedStep[]
  users: number
}) : INewStepsResponse {
  return {
    version: inst.currentVersion,
    steps: data.steps.map(s => s.toJSON()),
    clientIDs: data.steps.map(step => step.clientID),
    usersCount: data.users
  }
}

export const getDocuments = async (
  req: IRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const docs = docService.getDocuments()
    const result: IGetDocumentsResponse = { docs }
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export const getDocument = async (
  req: IRequest<{}, {}, { documentId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const IP = reqIP(req)
    const instance = docService.getInstance(req.params.documentId)
    instance.registerUser(IP)
    const result: IGetDocumentResponse = {
      doc: instance.doc.toJSON(),
      userCount: instance.userCount,
      version: instance.currentVersion,
    }
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export const getDocumentEvents = async (
  req: IRequest<{}, IGetDocEventsQueryParams, { documentId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const version = parseInt(parseQueryParam(req.query.version))
    const IP = reqIP(req)
    const instance = docService.getInstance(req.params.documentId)
    instance.registerUser(IP)
    const data = instance.getEvents(version)
    if (!data) {
      next(new CustomError('History no longer available', 410))
    } else if (data.steps.length > 0) {
      instance.sendUpdates()
      res.json(createNewStepsResponse(instance, data))
    } else {
      instance.addPendingRequest(IP, () => {
        res.json(createNewStepsResponse(instance, instance.getEvents(version)))
      })
      res.on('close', () => {
        instance.removePendingRequest(IP)
      })
    }
  } catch (err) {
    next(err)
  }
}

export const saveCollabSteps  = async (
  req: IRequest<ISaveCollabStepsParams, {}, { documentId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { version, steps, clientID } = req.body
    const IP = reqIP(req)
    const parsedSteps = docService.parseSteps(steps)
    const instance = docService.getInstance(req.params.documentId)
    instance.registerUser(IP)
    const result = instance.addEvents(version, parsedSteps, clientID)
    if (result) {
      instance.sendUpdates()
      res.json(result)
    } else {
      next(new CustomError('Version not current', 409))
    }
  } catch (err) {
    next(err)
  }
}
