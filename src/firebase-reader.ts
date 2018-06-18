import * as firebase from 'firebase/app'
import 'firebase/database'
import { IReadProvider, Reader } from 'canasta-core'
import { encodeFirebasePath, decodeFirebaseKey } from 'canasta-firebase-utils'

export class FirebaseReader extends Reader {
    constructor (firebase_database: firebase.database.Database) {
        super(new FirebaseReaderProvider(firebase_database))
    }
}

export class FirebaseReaderProvider implements IReadProvider {
    private firebase_database: firebase.database.Database
    private updates: {}

    constructor(firebase_database: firebase.database.Database) {
        this.firebase_database = firebase_database
        this.updates = {}
    }

    async read(docpath: string[]): Promise<{}> {
        const path = encodeFirebasePath(docpath)
        const snapshot = await this.firebase_database.ref(path).once('value')
        const obj = await snapshot.val()
        return obj
    }

}