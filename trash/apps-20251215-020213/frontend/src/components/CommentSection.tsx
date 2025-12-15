import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

interface Comment {
  id: number;
  response_id: number;
  content: string;
  author: {
    id: number;
    display_name: string;
    profile_slug: string;
  };
  parent_comment_id: number | null;
  thread_depth: number;
  is_edited: boolean;
  reaction_count: number;
  user_reaction: string | null;
  created_at: string;
  updated_at: string;
}

interface CommentSectionProps {
  responseId: number;
  currentUserId?: number;
}

const CommentSection: React.FC<CommentSectionProps> = ({ responseId, currentUserId }) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<number | null>(null);

  useEffect(() => {
    fetchComments();
  }, [responseId]);

  const fetchComments = async () => {
    try {
      const response = await api.get(`/api/responses/${responseId}/comments`);
      setComments(response.data.comments || []);
    } catch (error) {
      console.error('Failed to fetch comments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent, parentId?: number) => {
    e.preventDefault();
    if (!newComment.trim() || submitting) return;

    setSubmitting(true);
    try {
      const response = await api.post('/api/comments', {
        response_id: responseId,
        content: newComment.trim(),
        parent_comment_id: parentId || null
      });

      setComments([...comments, response.data]);
      setNewComment('');
      setReplyingTo(null);
    } catch (error) {
      console.error('Failed to post comment:', error);
      alert('Failed to post comment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (commentId: number) => {
    if (!editContent.trim() || submitting) return;

    setSubmitting(true);
    try {
      const response = await api.patch(`/api/comments/${commentId}`, {
        content: editContent.trim()
      });

      setComments(comments.map(c => c.id === commentId ? response.data : c));
      setEditingId(null);
      setEditContent('');
    } catch (error) {
      console.error('Failed to edit comment:', error);
      alert('Failed to edit comment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: number) => {
    if (!confirm('Are you sure you want to delete this comment?')) return;

    try {
      await api.delete(`/api/comments/${commentId}`);
      setComments(comments.filter(c => c.id !== commentId));
    } catch (error) {
      console.error('Failed to delete comment:', error);
      alert('Failed to delete comment. Please try again.');
    }
  };

  const startEditing = (comment: Comment) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditContent('');
  };

  const renderComment = (comment: Comment) => {
    const isAuthor = currentUserId === comment.author.id;
    const isEditing = editingId === comment.id;
    const isReplying = replyingTo === comment.id;
    const indent = comment.thread_depth * 24;

    return (
      <div
        key={comment.id}
        style={{
          marginLeft: `${indent}px`,
          padding: '16px',
          backgroundColor: 'rgba(0, 0, 0, 0.2)',
          borderRadius: '8px',
          marginBottom: '12px',
          borderLeft: comment.thread_depth > 0 ? '3px solid #00ffff' : 'none'
        }}
      >
        {/* Author and timestamp */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', gap: '8px' }}>
          <a
            href={`/u/${comment.author.profile_slug}`}
            style={{ color: '#00ffff', textDecoration: 'none', fontWeight: 500 }}
          >
            {comment.author.display_name}
          </a>
          <span style={{ color: '#888', fontSize: '0.85rem' }}>
            {new Date(comment.created_at).toLocaleString()}
          </span>
          {comment.is_edited && (
            <span style={{ color: '#888', fontSize: '0.85rem', fontStyle: 'italic' }}>
              (edited)
            </span>
          )}
        </div>

        {/* Comment content or edit form */}
        {isEditing ? (
          <div>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              style={{
                width: '100%',
                minHeight: '80px',
                padding: '8px',
                borderRadius: '4px',
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid #00ffff',
                color: '#fff',
                fontFamily: 'inherit',
                resize: 'vertical'
              }}
              maxLength={2000}
            />
            <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
              <button
                onClick={() => handleEdit(comment.id)}
                disabled={submitting}
                style={{
                  padding: '6px 16px',
                  borderRadius: '4px',
                  border: '1px solid #00ffff',
                  backgroundColor: '#00ffff',
                  color: '#000',
                  cursor: 'pointer'
                }}
              >
                Save
              </button>
              <button
                onClick={cancelEditing}
                style={{
                  padding: '6px 16px',
                  borderRadius: '4px',
                  border: '1px solid #888',
                  backgroundColor: 'transparent',
                  color: '#888',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ color: '#dcd1ff', lineHeight: 1.6, marginBottom: '12px' }}>
              {comment.content}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {comment.thread_depth < 3 && (
                <button
                  onClick={() => setReplyingTo(isReplying ? null : comment.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#00ffff',
                    cursor: 'pointer',
                    fontSize: '0.9rem'
                  }}
                >
                  Reply
                </button>
              )}

              {isAuthor && (
                <>
                  <button
                    onClick={() => startEditing(comment)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#00ffff',
                      cursor: 'pointer',
                      fontSize: '0.9rem'
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(comment.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ff6b6b',
                      cursor: 'pointer',
                      fontSize: '0.9rem'
                    }}
                  >
                    Delete
                  </button>
                </>
              )}

              {comment.reaction_count > 0 && (
                <span style={{ color: '#888', fontSize: '0.9rem' }}>
                  {comment.reaction_count} reaction{comment.reaction_count !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Reply form */}
            {isReplying && (
              <form onSubmit={(e) => handleSubmit(e, comment.id)} style={{ marginTop: '12px' }}>
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Write a reply..."
                  style={{
                    width: '100%',
                    minHeight: '60px',
                    padding: '8px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid #00ffff',
                    color: '#fff',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                  maxLength={2000}
                />
                <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                  <button
                    type="submit"
                    disabled={submitting || !newComment.trim()}
                    style={{
                      padding: '6px 16px',
                      borderRadius: '4px',
                      border: '1px solid #00ffff',
                      backgroundColor: submitting ? '#888' : '#00ffff',
                      color: '#000',
                      cursor: submitting ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {submitting ? 'Posting...' : 'Post Reply'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setReplyingTo(null); setNewComment(''); }}
                    style={{
                      padding: '6px 16px',
                      borderRadius: '4px',
                      border: '1px solid #888',
                      backgroundColor: 'transparent',
                      color: '#888',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    );
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>Loading comments...</div>;
  }

  return (
    <div style={{ marginTop: '32px' }}>
      <h3 style={{ color: '#00ffff', marginBottom: '20px', fontSize: '1.5rem' }}>
        Comments ({comments.length})
      </h3>

      {/* New comment form (top level) */}
      {currentUserId && !replyingTo && (
        <form onSubmit={(e) => handleSubmit(e)} style={{ marginBottom: '24px' }}>
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Share your thoughts on this response..."
            style={{
              width: '100%',
              minHeight: '100px',
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              border: '1px solid #00ffff',
              color: '#fff',
              fontFamily: 'inherit',
              fontSize: '1rem',
              resize: 'vertical'
            }}
            maxLength={2000}
          />
          <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#888', fontSize: '0.9rem' }}>
              {newComment.length}/2000 characters
            </span>
            <button
              type="submit"
              disabled={submitting || !newComment.trim()}
              style={{
                padding: '10px 24px',
                borderRadius: '25px',
                border: '1px solid #00ffff',
                backgroundColor: submitting || !newComment.trim() ? '#888' : '#00ffff',
                color: '#000',
                cursor: submitting || !newComment.trim() ? 'not-allowed' : 'pointer',
                fontSize: '1rem',
                fontWeight: 500
              }}
            >
              {submitting ? 'Posting...' : 'Post Comment'}
            </button>
          </div>
        </form>
      )}

      {!currentUserId && (
        <div style={{
          padding: '20px',
          textAlign: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.2)',
          borderRadius: '8px',
          marginBottom: '24px'
        }}>
          <p style={{ color: '#dcd1ff', marginBottom: '12px' }}>
            Sign in to join the conversation
          </p>
          <a
            href="/login"
            style={{
              padding: '10px 24px',
              borderRadius: '25px',
              border: '1px solid #00ffff',
              backgroundColor: 'rgba(0, 255, 255, 0.1)',
              color: '#00ffff',
              textDecoration: 'none',
              display: 'inline-block'
            }}
          >
            Sign In
          </a>
        </div>
      )}

      {/* Comments list */}
      {comments.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#888', padding: '40px 0' }}>
          No comments yet. Be the first to share your thoughts!
        </p>
      ) : (
        <div>
          {comments.map(renderComment)}
        </div>
      )}
    </div>
  );
};

export default CommentSection;
