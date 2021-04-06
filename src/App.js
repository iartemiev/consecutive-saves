import './App.css';
import { useState, useEffect } from 'react';

import Amplify, { Hub, DataStore, Predicates } from 'aws-amplify';

// Leaving these in for local linking/testing:
// import Amplify, { Hub } from '@aws-amplify/core';
// import { DataStore, Predicates } from '@aws-amplify/datastore';

import awsconfig from './aws-exports';
import { Post } from './models';

Amplify.configure(awsconfig);
Amplify.Logger.LOG_LEVEL = 'DEBUG';

function App() {
	const [posts, setPosts] = useState([]);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		startHub();

		DataStore.observe(Post).subscribe(getAllPosts);
	}, []);

	function startHub() {
		const removeListener = Hub.listen(
			'datastore',
			async ({ payload: { event } }) => {
				if (event === 'ready') {
					setReady(true);
					removeListener();
				}
			}
		);
	}

	async function getAllPosts() {
		const records = await DataStore.query(Post);
		setPosts(records);
	}

	async function newPost() {
		const newRecord = await DataStore.save(
			new Post({
				title: 'Create',
			})
		);

		return newRecord;
	}

	async function updatePost(record) {
		await DataStore.save(
			Post.copyOf(record, (updated) => {
				updated.title = 'Update';
			})
		);
	}

	async function deletePost(record) {
		await DataStore.delete(record);
	}

	async function createNewThenUpdate() {
		const newRecord = await newPost();
		await updatePost(newRecord);
	}

	async function consecutiveUpdates() {
		let newRecord = await newPost();

		// wait for record to perform a roundtrip
		// so that mutation queue is empty when
		// we perform the consecutive updates
		newRecord = await waitForSync(newRecord);

		for (let i = 1; i < 11; i++) {
			await DataStore.save(
				Post.copyOf(newRecord, (updated) => {
					updated.title = `Update ${i}`;
				})
			);
		}
	}

	async function createThenDelete() {
		const newRecord = await newPost();
		await deletePost(newRecord);
	}

	async function waitForSync(record) {
		let attempts = 1;
		while (record._version === undefined) {
			record = await DataStore.query(Post, record.id);

			// throw after 10 attempts
			if (attempts > 10) {
				throw new Error("Record didn't sync after save");
			}

			// try every 500ms
			await new Promise((resolve) => setTimeout(resolve, 500));

			attempts += 1;
		}

		return record;
	}

	async function deleteAll() {
		await DataStore.delete(Post, Predicates.ALL);
	}

	return (
		<div className="App">
			<header className="App-header">
				<p data-test="datastore-ready">Ready: {ready ? 'Yes' : 'No'}</p>
				<button data-test="datastore-get-records" onClick={getAllPosts}>
					Get All
				</button>
				<button
					data-test="datastore-create-then-update"
					onClick={createNewThenUpdate}
				>
					Create Then Update
				</button>
				<button
					data-test="datastore-consecutive-updates"
					onClick={consecutiveUpdates}
				>
					Consecutive Updates (10x)
				</button>
				<button
					data-test="datastore-create-then-delete"
					onClick={createThenDelete}
				>
					Create Then Delete
				</button>
				<button
					data-test="datastore-app-delete-all"
					onClick={deleteAll}
					style={{ backgroundColor: 'red' }}
				>
					Delete All
				</button>
				<pre>{JSON.stringify(posts, null, 2)}</pre>
			</header>
		</div>
	);
}

export default App;
