import * as firebase from 'firebase/app'
import 'firebase/database'
import { Setter, ISetterProvider } from 'canasta-core' // **NPM**
import { encodeFirebasePath, decodeFirebaseKey } from 'canasta-firebase-utils' // **NPM**

export class FirebaseSetter extends Setter {
    constructor(firebase_database: firebase.database.Database) {
        super(new FirebaseSetterProvider(firebase_database))
    }
}

export class FirebaseSetterProvider implements ISetterProvider {
    private firebase_database: firebase.database.Database
    private updates: { [index: string]: any }

    constructor(firebase_database: firebase.database.Database) {
        this.firebase_database = firebase_database
        this.updates = {}
    }

    async begin(): Promise<void> {
        this.updates = {}
    }

    async set(docpath: string[], valpath: string[], val: any): Promise<void> {
        const path = encodeFirebasePath(docpath.concat(valpath))
        this.updates[path] = val
    }

    async create(docpath: string[]): Promise<string> {
        const path = encodeFirebasePath(docpath)
        const key = this.firebase_database.ref(path).push().key
        if (key === null) {
            throw new Error('Unable to create new document key') // theoretically will never happen
        }
        return key
    }

    async remove(docpath: string[], valpath: string[]): Promise<void> {
        const path = encodeFirebasePath(docpath.concat(valpath))
        this.updates[path] = null
    }

    async increment(docpath: string[], valpath: string[]): Promise<number> {
        await this.commit()

        const path = encodeFirebasePath(docpath.concat(valpath))

        function increment_transaction(current_val: number | null) {
            return current_val === null ? 1 : current_val + 1
        }

        const { committed, snapshot } = await this.firebase_database.ref(path).transaction(increment_transaction)

        if (!committed) {
            throw new Error('internal error - increment_transaction failed to commit') // theoretically not possible
        }

        if (!snapshot) {
            throw new Error('internal error - increment_transaction failed to return a data value')
        }

        const val = snapshot.val()

        return val
    }

    async take(docpath: string[], valpath: string[], val: any): Promise<void> {
        if (val === null) {
            throw new Error('null value not allowed for take() operation')
        }

        await this.commit()

        const path = encodeFirebasePath(docpath.concat(valpath))

        const new_val_json = JSON.stringify(val);

        function take_transaction(current_val: any | null) {
            if (current_val === null) {
                return val // currently null - take it!
            }
            else {
                const current_val_json = JSON.stringify(current_val);
                if (current_val_json === new_val_json) {
                    return current_val // already mine - take it again!
                }
                else {
                    return // already taken - abort!
                }
            }
        }

        const { committed, snapshot } = await this.firebase_database.ref(path).transaction(take_transaction)

        if (!committed) {
            throw new Error('take failed - already taken')
        }
    }

    async commit(): Promise<void> {
        if (Object.keys(this.updates).length) {
            await this.firebase_database.ref().update(this.updates)
            this.updates = {}
        }
    }

    async abort(): Promise<void> {
        this.updates = {}
    }

}