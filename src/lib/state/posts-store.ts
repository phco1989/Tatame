import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SchoolPost, PostComment, UserRole } from "@/types";

// Mock posts data for demo
const MOCK_POSTS: SchoolPost[] = [
  {
    id: "post-1",
    academyId: "tenant_1",
    authorId: "manager-1",
    authorName: "Maria Silva",
    role: "manager",
    text: "Great news! We have new gis and rashguards arriving this weekend. Perfect for beginners and advanced practitioners. Come check them out!",
    imageUrl: "https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=800",
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    likesCount: 12,
    commentsCount: 3,
    likedBy: ["user-2", "user-3", "user-4"],
  },
  {
    id: "post-2",
    academyId: "tenant_1",
    authorId: "coach-1",
    authorName: "Carlos Santos",
    role: "coach",
    text: "Morning session was incredible today! Great drilling and live sparring. Shoutout to everyone who showed up early!",
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    likesCount: 8,
    commentsCount: 2,
    likedBy: ["user-1", "user-5"],
  },
  {
    id: "post-3",
    academyId: "tenant_1",
    authorId: "manager-1",
    authorName: "Maria Silva",
    role: "manager",
    text: "Reminder: Due to the seminar on Saturday, afternoon classes will start 30 minutes earlier. Please arrive by 2:30 PM instead of 3:00 PM.",
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    likesCount: 5,
    commentsCount: 1,
    likedBy: [],
  },
  {
    id: "post-4",
    academyId: "tenant_1",
    authorId: "coach-2",
    authorName: "Ana Costa",
    role: "coach",
    text: "Congrats to Jake for getting his first submission today! Keep up the great work. See you next week for more training!",
    imageUrl: "https://images.unsplash.com/photo-1455264745730-cb3b76250ae8?w=800",
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    likesCount: 15,
    commentsCount: 4,
    likedBy: ["user-1", "user-2", "user-6"],
  },
];

// Mock comments data for demo
const MOCK_COMMENTS: Record<string, PostComment[]> = {
  "post-1": [
    {
      id: "comment-1",
      postId: "post-1",
      authorId: "user-2",
      authorName: "Lucas Pereira",
      role: "student",
      text: "Can't wait to try them out!",
      createdAt: new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "comment-2",
      postId: "post-1",
      authorId: "coach-1",
      authorName: "Carlos Santos",
      role: "coach",
      text: "These boards are perfect for the conditions we've been having.",
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ],
  "post-2": [
    {
      id: "comment-3",
      postId: "post-2",
      authorId: "user-5",
      authorName: "Sofia Lima",
      role: "student",
      text: "Best session ever! Thanks for the tips, coach!",
      createdAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
    },
  ],
  "post-4": [
    {
      id: "comment-4",
      postId: "post-4",
      authorId: "user-1",
      authorName: "Jake Miller",
      role: "student",
      text: "Thanks everyone! Couldn't have done it without Coach Ana!",
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    },
  ],
};

interface PostsState {
  posts: SchoolPost[];
  comments: Record<string, PostComment[]>;
  isLoading: boolean;
}

interface PostsActions {
  // Post actions
  addPost: (post: SchoolPost) => void;
  deletePost: (postId: string, userRole: UserRole, userId: string) => boolean;
  toggleLike: (postId: string, userId: string) => void;

  // Comment actions
  addComment: (postId: string, comment: PostComment) => void;
  deleteComment: (
    postId: string,
    commentId: string,
    userRole: UserRole,
    userId: string
  ) => boolean;

  // Query helpers
  getPostsForSchool: (schoolId: string) => SchoolPost[];

  // Reset to mock data (for demo)
  resetToMockData: () => void;
}

export const usePostsStore = create<PostsState & PostsActions>()(
  persist(
    (set, get) => ({
      posts: MOCK_POSTS,
      comments: MOCK_COMMENTS,
      isLoading: false,

      addPost: (post) => {
        set((state) => ({
          posts: [post, ...state.posts],
        }));
      },

      deletePost: (postId, userRole, userId) => {
        const post = get().posts.find((p) => p.id === postId);
        if (!post) return false;

        // Managers can delete any post, users can only delete their own
        const canDelete = userRole === "manager" || post.authorId === userId;

        if (canDelete) {
          set((state) => ({
            posts: state.posts.filter((p) => p.id !== postId),
            // Also remove comments for this post
            comments: Object.fromEntries(
              Object.entries(state.comments).filter(([key]) => key !== postId)
            ),
          }));
          return true;
        }

        return false;
      },

      toggleLike: (postId, userId) => {
        set((state) => ({
          posts: state.posts.map((post) => {
            if (post.id !== postId) return post;

            const isLiked = post.likedBy.includes(userId);
            const newLikedBy = isLiked
              ? post.likedBy.filter((id) => id !== userId)
              : [...post.likedBy, userId];

            return {
              ...post,
              likedBy: newLikedBy,
              likesCount: newLikedBy.length,
            };
          }),
        }));
      },

      addComment: (postId, comment) => {
        set((state) => {
          const existingComments = state.comments[postId] || [];
          const updatedComments = {
            ...state.comments,
            [postId]: [...existingComments, comment],
          };

          // Update comment count on the post
          const updatedPosts = state.posts.map((post) => {
            if (post.id !== postId) return post;
            return {
              ...post,
              commentsCount: (state.comments[postId]?.length || 0) + 1,
            };
          });

          return {
            comments: updatedComments,
            posts: updatedPosts,
          };
        });
      },

      deleteComment: (postId, commentId, userRole, userId) => {
        const postComments = get().comments[postId];
        if (!postComments) return false;

        const comment = postComments.find((c) => c.id === commentId);
        if (!comment) return false;

        // Managers can delete any comment, users can only delete their own
        const canDelete = userRole === "manager" || comment.authorId === userId;

        if (canDelete) {
          set((state) => {
            const updatedComments = {
              ...state.comments,
              [postId]: state.comments[postId].filter((c) => c.id !== commentId),
            };

            // Update comment count on the post
            const updatedPosts = state.posts.map((post) => {
              if (post.id !== postId) return post;
              return {
                ...post,
                commentsCount: Math.max(0, post.commentsCount - 1),
              };
            });

            return {
              comments: updatedComments,
              posts: updatedPosts,
            };
          });
          return true;
        }

        return false;
      },

      getPostsForSchool: (schoolId) => {
        return get().posts.filter((post) => post.academyId === schoolId);
      },

      resetToMockData: () => {
        set({
          posts: MOCK_POSTS,
          comments: MOCK_COMMENTS,
        });
      },
    }),
    {
      name: "ayon-flow-posts",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        posts: state.posts,
        comments: state.comments,
      }),
    }
  )
);

// Selectors for easy access
export const selectAllPosts = (state: PostsState & PostsActions) => state.posts;
export const selectPostById = (postId: string) => (state: PostsState & PostsActions) =>
  state.posts.find((p) => p.id === postId);
export const selectCommentsForPost = (postId: string) => (state: PostsState & PostsActions) =>
  state.comments[postId] || [];
export const selectPostsCount = (state: PostsState & PostsActions) => state.posts.length;
export const selectIsLoading = (state: PostsState & PostsActions) => state.isLoading;

// Helper to check if user has liked a post
export const selectHasUserLikedPost =
  (postId: string, userId: string) => (state: PostsState & PostsActions) => {
    const post = state.posts.find((p) => p.id === postId);
    return post ? post.likedBy.includes(userId) : false;
  };

// Helper to get posts sorted by date (newest first)
export const selectPostsSortedByDate = (state: PostsState & PostsActions) =>
  [...state.posts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

// Helper to create a new post object
export const createPost = (
  academyId: string,
  authorId: string,
  authorName: string,
  role: UserRole,
  text: string,
  imageUrl?: string
): SchoolPost => ({
  id: `post-${Date.now()}`,
  academyId,
  authorId,
  authorName,
  role,
  text,
  imageUrl,
  createdAt: new Date().toISOString(),
  likesCount: 0,
  commentsCount: 0,
  likedBy: [],
});

// Helper to create a new comment object
export const createComment = (
  postId: string,
  authorId: string,
  authorName: string,
  role: UserRole,
  text: string
): PostComment => ({
  id: `comment-${Date.now()}`,
  postId,
  authorId,
  authorName,
  role,
  text,
  createdAt: new Date().toISOString(),
});
