import { Controller, IConnector, IControllers, IEventsPublisher, IConnection } from 'canasta-core'
import { FirebaseConnector, IFirebaseConnection } from './firebase-connector';
import { FirebaseReader } from './firebase-reader';
import { FirebaseUpdater } from './firebase-updater';
import { FirebaseModuleAction } from './firebase-module-action';
import { FirebaseWatcher } from './firebase-watcher';

export interface IFirebaseControllerOptions {
    local_storage_item_key?: string
}

export class FirebaseController extends Controller {

    constructor(options?: IFirebaseControllerOptions) {

        const connectorFactory: (eventsPublisher: IEventsPublisher) => IConnector = (eventsPublisher) => {
            return new FirebaseConnector(eventsPublisher, options)
        }

        const controllersFactory: (connection: IConnection, eventsPublisher: IEventsPublisher) => IControllers = (connection, eventsPublisher) => {
            const { firebase_database, firebase_auth, functions_url } = <IFirebaseConnection>connection
            if (!firebase_database || !firebase_auth || !functions_url) {
                throw new Error('Bad connection')
            }
            return {
                reader: new FirebaseReader(firebase_database),
                updater: new FirebaseUpdater(firebase_database),
                moduleAction: new FirebaseModuleAction(firebase_auth, functions_url),
                watcher: new FirebaseWatcher(firebase_database, eventsPublisher),
            }
        }

        super(connectorFactory, controllersFactory)
    }

}