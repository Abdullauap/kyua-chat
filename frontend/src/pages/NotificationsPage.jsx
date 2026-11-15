import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { acceptFriendRequest, getFriendRequests } from "../lib/api";
import { GiRingingBell } from "react-icons/gi";
import { FaUserCheck } from "react-icons/fa6";
import { FaRegClock } from "react-icons/fa6";
import { FaMessage } from "react-icons/fa6";
import NoNotificationsFound from "../components/NoNotificationsFound";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useNotificationStore } from "../store/useNotificationStore";
import { MessageSquare, PhoneMissed, UserPlus, UserMinus, Mail } from "lucide-react";

const ACTIVITY_ICON = {
  group_message: <MessageSquare className="size-4 text-primary" />,
  private_message: <Mail className="size-4 text-secondary" />,
  missed_call: <PhoneMissed className="size-4 text-error" />,
  group_added: <UserPlus className="size-4 text-success" />,
  group_removed: <UserMinus className="size-4 text-warning" />,
};

const timeAgo = (ts) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
};

const NotificationsPage = () => {
  const queryClient = useQueryClient();
  const items = useNotificationStore((s) => s.items);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const clearItems = useNotificationStore((s) => s.clearItems);

  // Opening the page counts as reading the activity feed.
  useEffect(() => {
    markAllRead();
  }, [markAllRead, items.length]);

  const { data: friendRequests, isLoading } = useQuery({
    queryKey: ["friendRequests"],
    queryFn: getFriendRequests,
  });

  const { mutate: acceptRequestMutation, isPending } = useMutation({
    mutationFn: acceptFriendRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friendRequests"] });
      queryClient.invalidateQueries({ queryKey: ["friends"] });
    },
  });

  const incomingRequests = friendRequests?.incomingReqs || [];
  const acceptedRequests = friendRequests?.acceptedReqs || [];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="container mx-auto max-w-4xl space-y-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-6">Notifications</h1>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        ) : (
          <>
            {incomingRequests.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <FaUserCheck className="h-5 w-5 text-primary" />
                  Friend Requests
                  <span className="badge badge-primary ml-2">{incomingRequests.length}</span>
                </h2>

                <div className="space-y-3">
                  {incomingRequests.map((request) => (
                    <div
                      key={request._id}
                      className="card bg-base-200 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="card-body p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="avatar w-14 h-14 rounded-full bg-base-300">
                              <img src={request.sender.profilePicture} alt={request.sender.fullName} />
                            </div>
                            <div>
                              <h3 className="font-semibold">{request.sender.fullName}</h3>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                <span className="badge badge-secondary badge-sm">
                                  Native: {request.sender.nativeLanguage}
                                </span>
                                <span className="badge badge-outline badge-sm">
                                  Learning: {request.sender.learningLanguage}
                                </span>
                              </div>
                            </div>
                          </div>

                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => acceptRequestMutation(request._id)}
                            disabled={isPending}
                          >
                            Accept
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {items.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Recent activity</h2>
                  <button className="btn btn-ghost btn-xs" onClick={clearItems}>
                    Clear all
                  </button>
                </div>
                <div className="card bg-base-200 divide-y divide-base-300 overflow-hidden">
                  {items.map((item) => {
                    const content = (
                      <div className="flex items-center gap-3 p-4 hover:bg-base-300/50 transition">
                        <div className="relative shrink-0">
                          {item.avatar ? (
                            <img src={item.avatar} alt="" className="size-10 rounded-full object-cover bg-base-300" />
                          ) : (
                            <div className="size-10 rounded-full bg-base-300 grid place-items-center">
                              {ACTIVITY_ICON[item.type]}
                            </div>
                          )}
                          {item.avatar && (
                            <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-base-100 ring-2 ring-base-200">
                              {ACTIVITY_ICON[item.type]}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{item.title}</p>
                          <p className="text-sm opacity-70 truncate">{item.body}</p>
                        </div>
                        <span className="text-xs opacity-50 shrink-0">{timeAgo(item.createdAt)}</span>
                      </div>
                    );
                    return item.link ? (
                      <Link key={item.id} to={item.link} className="block">
                        {content}
                      </Link>
                    ) : (
                      <div key={item.id}>{content}</div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ACCEPTED REQS NOTIFICATONS */}
            {acceptedRequests.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <GiRingingBell className="h-5 w-5 text-success" />
                  New Connections
                </h2>

                <div className="space-y-3">
                  {acceptedRequests.map((notification) => (
                    <div key={notification._id} className="card bg-base-200 shadow-sm">
                      <div className="card-body p-4">
                        <div className="flex items-start gap-3">
                          <div className="avatar mt-1 size-10 rounded-full">
                            <img src={notification.recipient.profilePicture} alt={notification.recipient.fullName} />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold">{notification.recipient.fullName}</h3>
                            <p className="text-sm my-1">
                              {notification.recipient.fullName} accepted your friend request
                            </p>
                            <p className="text-xs flex items-center opacity-70">
                              <FaRegClock className="h-3 w-3 mr-1" />
                              Recently
                            </p>
                          </div>
                          <div className="badge badge-success">
                            <FaMessage className="h-3 w-3 mr-1" />
                            New Friend
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {incomingRequests.length === 0 && acceptedRequests.length === 0 && items.length === 0 && (
              <NoNotificationsFound />
            )}
          </>
        )}
      </div>
    </div>
  );
};
export default NotificationsPage;