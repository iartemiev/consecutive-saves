import './App.css';
import { useState, useEffect } from 'react';

import Amplify, { Hub, DataStore, Predicates } from 'aws-amplify';

// Leaving these in for local linking/testing:
// import Amplify, { Hub } from '@aws-amplify/core';
// import { DataStore, Predicates } from '@aws-amplify/datastore';

import awsconfig from './aws-exports';
import { Post, Comment } from './models';

Amplify.configure(awsconfig);
Amplify.Logger.LOG_LEVEL = 'DEBUG';

/* 

  Test scenarios in consecutive-saves.spec:

  1. Create new Post, then immediately update
  2. Create new Post, then immediately update with a different field
  3. Create new Post, wait for sync to complete, then update 10 times consecutively
  4. Create new Post, then immediately delete
	5. Create new Post with Comment, reassign Comment to a different Post
	6. Consecutive updates with conditions
*/

function App() {
	const [posts, setPosts] = useState([]);
	const [comments, setComments] = useState([]);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		startHub();

		const postSub = DataStore.observe(Post).subscribe(getAllPosts);
		const commentSub = DataStore.observe(Comment).subscribe(getAllComments);

		return () => {
			postSub && postSub.unsubscribe();
			commentSub && commentSub.unsubscribe();
		};
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

	async function getAllComments() {
		const records = await DataStore.query(Comment);
		setComments(records);
	}

	async function deletePost(record) {
		await DataStore.delete(record);
	}

	async function newPost(title = 'Create') {
		return await DataStore.save(
			new Post({
				title,
			})
		);
	}

	async function createNewThenUpdate() {
		const newRecord = await newPost();

		await DataStore.save(
			Post.copyOf(newRecord, (updated) => {
				updated.title = 'Update';
			})
		);
	}

	async function createNewThenUpdateAnotherField() {
		const newRecord = await newPost();

		await DataStore.save(
			Post.copyOf(newRecord, (updated) => {
				updated.description = 'Description from Update';
			})
		);
	}

	async function consecutiveUpdates() {
		let newRecord = await newPost();

		// wait for record to perform a roundtrip
		// so that mutation queue is empty when
		// we perform the consecutive updates
		newRecord = await waitForSync(Post, newRecord);

		for (let i = 1; i < 10; i++) {
			await DataStore.save(
				Post.copyOf(newRecord, (updated) => {
					updated.title = `Update ${i}`;
				})
			);
		}

		await DataStore.save(
			Post.copyOf(newRecord, (updated) => {
				updated.description = `Description from Update 10`;
			})
		);
	}

	async function createThenDelete() {
		const newRecord = await newPost();
		await deletePost(newRecord);
	}

	async function waitForSync(model, record) {
		let attempts = 1;
		while (record._version === undefined) {
			record = await DataStore.query(model, record.id);

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

	async function createRecordsThenReassign() {
		const newRecord = await newPost();

		const newComment = await waitForSync(
			Comment,
			await DataStore.save(
				new Comment({
					content: 'Create Comment',
					post: newRecord,
				})
			)
		);

		const anotherRecord = await newPost('Create 2');

		await DataStore.save(
			Comment.copyOf(newComment, (updated) => {
				updated.post = anotherRecord;
			})
		);
	}

	async function consecutiveUpdatesWithCondition() {
		let newRecord = await newPost();

		// wait for record to perform a roundtrip
		// so that mutation queue is empty when
		// we perform the consecutive updates
		newRecord = await waitForSync(Post, newRecord);

		for (let i = 1; i < 4; i++) {
			await DataStore.save(
				Post.copyOf(newRecord, (updated) => {
					updated.title = `Update ${i}`;
				}),
				(c) => c.id('ne', 'not-an-id')
			);
		}

		await DataStore.save(
			Post.copyOf(newRecord, (updated) => {
				updated.description = `Description from Update`;
			})
		);
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
					data-test="datastore-create-then-update-different-field"
					onClick={createNewThenUpdateAnotherField}
				>
					Create Then Update A different field
				</button>
				<button
					data-test="datastore-consecutive-updates"
					onClick={consecutiveUpdates}
				>
					Consecutive Updates
				</button>
				<button
					data-test="datastore-create-then-delete"
					onClick={createThenDelete}
				>
					Create Then Delete
				</button>
				<button
					data-test="datastore-create-post-comment-reassign"
					onClick={createRecordsThenReassign}
				>
					Create Post & Comment, Then Reassign
				</button>
				<button
					data-test="datastore-consecutive-updates-condition"
					onClick={consecutiveUpdatesWithCondition}
				>
					Consecutive Updates With Condition
				</button>
				<button
					data-test="datastore-app-delete-all"
					onClick={deleteAll}
					style={{ backgroundColor: 'red' }}
				>
					Delete All
				</button>
				<pre>posts: {JSON.stringify(posts, null, 2)}</pre>
				<pre>comments: {JSON.stringify(comments, null, 2)}</pre>
			</header>
		</div>
	);
}

export default App;
