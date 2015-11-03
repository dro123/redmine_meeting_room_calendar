class MeetingRoomCalendarController < ApplicationController
  unloadable
  accept_api_auth :index, :create, :update, :delete, :missing_config

  def initialize
    super()

    @settings = Setting['plugin_redmine_meeting_room_calendar']

    # Backward compatibility
    @project_id = Setting['plugin_redmine_meeting_room_calendar']['project_id']
    @project_ids = Setting['plugin_redmine_meeting_room_calendar']['project_ids'] || []
    unless @project_id == nil || @project_id == 0 ||  @project_id == '0' || @project_id == ''
      @project_ids = @project_ids + [@project_id]
      Setting['plugin_redmine_meeting_room_calendar']['project_ids'] = @project_ids
    else
      @project_id = @project_ids[0]
    end
    Setting['plugin_redmine_meeting_room_calendar']['project_id'] = '0'

    @tracker_id = Setting['plugin_redmine_meeting_room_calendar']['tracker_id']
    @custom_field_id_room = Setting['plugin_redmine_meeting_room_calendar']['custom_field_id_room']
    @custom_field_id_start = Setting['plugin_redmine_meeting_room_calendar']['custom_field_id_start']
    @custom_field_id_end = Setting['plugin_redmine_meeting_room_calendar']['custom_field_id_end']
    @issue_status_id = Setting['plugin_redmine_meeting_room_calendar']['issue_status_id']
    @show_categories = Setting['plugin_redmine_meeting_room_calendar']['show_categories']
    @allow_changing_old_meetings = Setting['plugin_redmine_meeting_room_calendar']['allow_changing_old_meetings'] || 0
    @allow_drag_and_drop = Setting['plugin_redmine_meeting_room_calendar']['allow_drag_and_drop'] || 0
    @allow_resize = Setting['plugin_redmine_meeting_room_calendar']['allow_resize'] || 0
    @allow_multiple_days = Setting['plugin_redmine_meeting_room_calendar']['allow_multiple_days'] || 0

    if check_settings
      @start_time = CustomField.find_by_id(@custom_field_id_start).possible_values
      @end_time =  CustomField.find_by_id(@custom_field_id_end).possible_values
      @meeting_rooms = CustomField.find_by_id(@custom_field_id_room).possible_values
    end

    if Rails::VERSION::MAJOR < 3
      @base_url = Redmine::Utils::relative_url_root
    else
      @base_url = config.relative_url_root
    end
  end

  def index
    unless check_settings
      redirect_to :action => 'missing_config'
      return
    end

    @projects = Project.find(@project_ids).select{ |p| p.visible? && User.current.allowed_to?(:view_issues, p) }.sort_by { |p| p.name }.collect { |p| [p.name, p.id] }
    @project = Project.find_by_id(params[:project_id].to_i)
    if @project == nil
      @project = Project.find_by_id(@project_id.to_i)
    end
    if @project != nil && (!@project.visible? || !User.current.allowed_to?(:view_issues, @project)) && @projects != nil && @projects.first != nil
      @project = Project.find_by_id(@projects.first[1])
    end
    if @project == nil
      redirect_to :action => 'missing_config'
      return
    end
    @project_id = @project.id
    @user = User.current.id
    @user_name = User.current.name
    @user_last_name = User.current.name(:lastname_coma_firstname)
    @user_is_manager = 0
    if User.current.allowed_to?(:edit_project, @project) 
      @user_is_manager = 1
    end
    @assignable_users = @project.assignable_users.collect { |user| [user.name, user.id] }
    @categories = [['', 0]] + @project.issue_categories.collect { |c| [c.name, c.id] }

    @api_key = User.current.api_key
    unless User.current.allowed_to?(:view_issues, @project)
      render_403
    end
    
    @user_can_add = User.current.allowed_to?(:add_issues, @project)
    @user_can_edit = User.current.allowed_to?(:edit_issues, @project)
    @user_can_delete = User.current.allowed_to?(:delete_issues, @project)

    if @project.project_meeting_rooms && !@project.project_meeting_rooms.empty?
      rooms = @project.project_meeting_rooms.split(',').collect { |r| r.strip }
      if @meeting_rooms == nil || @meeting_rooms.count == 0
        @meeting_rooms = rooms
      else
        @meeting_rooms = @meeting_rooms & rooms
      end
    end

    if Setting['plugin_redmine_meeting_room_calendar']['show_project_menu'] != '1'
      @project = nil
    end
  end

  def create
    @projects = Project.find(@project_ids).select{ |p| p.visible? }.sort_by { |p| p.name }.collect { |p| [p.name, p.id] }
    @project = Project.find_by_id(params[:project_id].to_i)
    if @project == nil
      @project = Project.find_by_id(@project_id.to_i)
    end
    if @project == nil
      redirect_to :action => 'missing_config'
      return
    end
    @project_id = @project.id

    unless User.current.allowed_to?(:add_issues, @project)
      render_403
      return
    end

    recur_meeting = params[:recur]
    recur_type = params[:periodtype].to_i
    recur_period = params[:period].to_i
    meeting_day = params[:start_date]
    if @allow_multiple_days
      meeting_end_day = params[:due_date]
    else
      meeting_end_day = meeting_day
    end
    meeting_date = Date.parse(meeting_day)
    meeting_end_date = Date.parse(meeting_end_day)
    project_id = params[:project_id].to_i

    if recur_meeting != 'true'
      recur_type = 1
      recur_period = 1
    end

    while recur_period > 0
      week_day = meeting_date.wday # 0->Sunday, 6-> Saturday
      if week_day!=6 && week_day!=0
        @calendar_issue= Issue.new
        @calendar_issue.project_id = project_id
        @calendar_issue.tracker_id = @tracker_id
        @calendar_issue.subject = params[:subject]
        @calendar_issue.author_id = params[:author_id]
        @calendar_issue.assigned_to_id = params[:assigned_to_id]
        if @show_categories
          @calendar_issue.category_id = params[:category_id]
        end
        @calendar_issue.start_date = meeting_date
        @calendar_issue.due_date = meeting_end_date
        @calendar_issue.custom_field_values = params[:custom_field_values]
        if @issue_status_id != nil && @issue_status_id != '0' && @issue_status_id != 0
          @calendar_issue.status = IssueStatus.find_by_id(@issue_status_id)
        end
        orig_mail_notification = User.current.mail_notification
        User.current.mail_notification = 'none'
        User.current.save
        User.current.reload
        @calendar_issue.save!
        User.current.mail_notification = orig_mail_notification
        User.current.save
        User.current.reload
      else
        recur_period +=1
      end
      meeting_date += recur_type
      meeting_end_date += recur_type
      recur_period -=1
    end
  end

  def update
    @projects = Project.find(@project_ids).select{ |p| p.visible? }.sort_by { |p| p.name }.collect { |p| [p.name, p.id] }
    @project = Project.find_by_id(params[:project_id].to_i)
    if @project == nil
      @project = Project.find_by_id(@project_id.to_i)
    end
    if @project == nil
      redirect_to :action => 'missing_config'
      return
    end
    @project_id = @project.id

    unless User.current.allowed_to?(:edit_issues, @project)
      render_403
      return
    end

    meeting_day = params[:start_date]
    if @allow_multiple_days
      meeting_end_day = params[:due_date]
    else
      meeting_end_day = meeting_day
    end
    meeting_date = Date.parse(meeting_day)
    meeting_end_date = Date.parse(meeting_end_day)
    project_id = params[:project_id].to_i

    @calendar_issue = Issue.new
    @calendar_issue.project_id = project_id
    @calendar_issue.tracker_id = @tracker_id
    @calendar_issue = Issue.find(params[:event_id])
    @calendar_issue.subject = params[:subject]
    @calendar_issue.assigned_to_id = params[:assigned_to_id]
    if @show_categories
      @calendar_issue.category_id = params[:category_id]
    end
    @calendar_issue.start_date = meeting_date
    @calendar_issue.due_date = meeting_end_day
    @calendar_issue.custom_field_values = params[:custom_field_values]
    orig_mail_notification = User.current.mail_notification
    User.current.mail_notification = 'none'
    User.current.save
    User.current.reload
    @calendar_issue.save!
    User.current.mail_notification = orig_mail_notification
    User.current.save
    User.current.reload
  end

  def delete
    @projects = Project.find(@project_ids).select{ |p| p.visible? }.sort_by { |p| p.name }.collect { |p| [p.name, p.id] }
    @project = Project.find_by_id(params[:project_id].to_i)
    if @project == nil
      @project = Project.find_by_id(@project_id.to_i)
    end
    if @project == nil
      redirect_to :action => 'missing_config'
      return
    end
    @project_id = @project.id

    unless User.current.allowed_to?(:delete_issues, @project)
      render_403
      return
    end

    @calendar_issue = Issue.find(params[:event_id])
    begin
      @calendar_issue.reload.destroy
    rescue ::ActiveRecord::RecordNotFound # raised by #reload if issue no longer exists
      # nothing to do, issue was already deleted (eg. by a parent)
    end
  end

  def check_settings
    if @project_ids == nil || @project_ids.length == 0 || @project_ids[0].to_s == '0' || @project_ids[0].to_s == ''
      return false
    end
    if @tracker_id == nil || @tracker_id.to_s == '0' || @tracker_id.to_s == ''
      return false
    end
    if @custom_field_id_room == nil || @custom_field_id_room.to_s == '0' || @custom_field_id_room.to_s == ''
      return false
    end
    if @custom_field_id_start == nil || @custom_field_id_start.to_s == '0' || @custom_field_id_start.to_s == ''
      return false
    end
    if @custom_field_id_end == nil || @custom_field_id_end.to_s == '0' || @custom_field_id_end.to_s == ''
      return false
    end

    return true
  end

  def missing_config

  end
end
