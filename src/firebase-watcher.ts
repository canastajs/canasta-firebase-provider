import * as firebase from 'firebase/app'
import 'firebase/database'
import { Watcher, IWatchProvider, IWatcherSubscription, IEventsPublisher } from 'canasta-core' // **NPM**
import { encodeFirebasePath, decodeFirebaseKey } from 'canasta-firebase-utils' // **NPM**

export class FirebaseWatcher extends Watcher {
    constructor(firebase_database: firebase.database.Database, eventsPublisher: IEventsPublisher) {
        const watcherProvider = new FirebaseWatcherProvider(firebase_database)
        super(watcherProvider, eventsPublisher)
    }
}

export class FirebaseWatcherProvider implements IWatchProvider {
    private firebase_database: firebase.database.Database
    private updates: {}

    constructor(firebase_database: firebase.database.Database) {
        this.firebase_database = firebase_database
        this.updates = {}
    }

    watch_doc(docpath: any, update: (val: any) => void, error: (error: any) => void): IWatcherSubscription {

        function update_data(child: firebase.database.DataSnapshot | null) {
            if (child) {
                const val = child.val()
                update(val)
            }
        }

        function on_error(e: Error) {
            error(e)
        }

        const path = encodeFirebasePath(docpath)

        const ref = this.firebase_database.ref(path)
        ref.on('value', update_data, on_error)

        return ref
    }

    watch_collection(collpath: any, update: (key: string, val: any) => void, remove: (key: string) => void, error: (error: any) => void): IWatcherSubscription {

        function update_data(child: firebase.database.DataSnapshot | null) {
            if (child && child.key) {
                const key = decodeFirebaseKey(child.key)
                const val = child.val()
                update(key, val)
            }
        }

        function remove_data(child: firebase.database.DataSnapshot | null) {
            if (child && child.key) {
                const key = decodeFirebaseKey(child.key)
                remove(key)
            }
        }

        function on_error(e: Error) {
            error(e)
        }

        const path = encodeFirebasePath(collpath)

        const ref = this.firebase_database.ref(path)
        ref.on('child_added', update_data, on_error)
        ref.on('child_changed', update_data, on_error)
        ref.on('child_removed', remove_data, on_error)

        return ref
    }
    
}